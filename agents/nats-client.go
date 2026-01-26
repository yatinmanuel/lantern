package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/nats-io/nats.go"
)

// Task represents a task from the PXE server
type Task struct {
	ID      int    `json:"id"`
	Type    string `json:"type"`
	Command string `json:"command"`
}

var (
	natsURL    = flag.String("url", "nats://192.168.1.10:4222", "NATS server URL")
	macAddress = flag.String("mac", "", "MAC address of this client")
	logFile    = flag.String("log", "/tmp/pxe-agent.log", "Log file path")
	pxeServer  = flag.String("server", "http://192.168.1.10:3000", "PXE server URL")
	tlsCA      = flag.String("tls-ca", "", "Path to CA certificate for NATS TLS")
	tlsCert    = flag.String("tls-cert", "", "Path to client certificate for NATS TLS")
	tlsKey     = flag.String("tls-key", "", "Path to client key for NATS TLS")
)

func main() {
	flag.Parse()

	if *macAddress == "" {
		log.Fatal("MAC address is required (-mac flag)")
	}

	// Open log file
	logFileHandle, err := os.OpenFile(*logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Fatal("Failed to open log file:", err)
	}
	defer logFileHandle.Close()
	log.SetOutput(logFileHandle)

	log.Printf("Starting NATS client for MAC: %s", *macAddress)
	log.Printf("Connecting to NATS: %s", *natsURL)

	var opts []nats.Option
	opts = append(opts,
		nats.Name("pxe-agent"),
		nats.ReconnectWait(time.Second),
		nats.MaxReconnects(-1),
		nats.DisconnectErrHandler(func(nc *nats.Conn, err error) {
			log.Printf("NATS disconnected: %v", err)
		}),
		nats.ReconnectHandler(func(nc *nats.Conn) {
			log.Printf("NATS reconnected to %s", nc.ConnectedUrl())
		}),
	)

	if *tlsCert != "" || *tlsKey != "" {
		if *tlsCert == "" || *tlsKey == "" {
			log.Fatal("Both -tls-cert and -tls-key must be provided for client TLS auth")
		}
		opts = append(opts, nats.ClientCert(*tlsCert, *tlsKey))
	}
	if *tlsCA != "" {
		opts = append(opts, nats.RootCAs(*tlsCA))
	}

	// Connect to NATS
	nc, err := nats.Connect(*natsURL, opts...)
	if err != nil {
		log.Fatal("Failed to connect to NATS:", err)
	}
	defer nc.Close()

	log.Printf("Connected to NATS: %s", nc.ConnectedUrl())

	// Create JetStream context
	js, err := nc.JetStream()
	if err != nil {
		log.Fatal("Failed to create JetStream context:", err)
	}

	// Subscribe to tasks for this MAC address
	subject := fmt.Sprintf("pxe.tasks.%s", *macAddress)
	consumerName := fmt.Sprintf("pxe-agent-%s", *macAddress)

	log.Printf("Subscribing to subject: %s", subject)

	// Create or get consumer
	_, err = js.AddConsumer("PXE_TASKS", &nats.ConsumerConfig{
		Durable:       consumerName,
		FilterSubject: subject,
		AckPolicy:    nats.AckExplicitPolicy,
		MaxDeliver:    3,
	})
	if err != nil {
		// Check if error is because consumer already exists (this is OK)
		if err.Error() != "nats: consumer name already in use" && 
		   !strings.Contains(err.Error(), "already exists") &&
		   !strings.Contains(err.Error(), "name already in use") {
			log.Printf("Warning: Failed to create consumer: %v", err)
		}
		// If consumer already exists, that's fine - we'll use the existing one
	}

	// Subscribe and process messages using pull consumer
	sub, err := js.PullSubscribe(subject, consumerName, nats.Bind("PXE_TASKS", consumerName))
	if err != nil {
		log.Fatal("Failed to subscribe:", err)
	}

	log.Printf("Subscribed successfully, waiting for tasks...")

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Process messages in a goroutine
	go func() {
		for {
			msgs, err := sub.Fetch(1, nats.MaxWait(5*time.Second))
			if err != nil {
				if err == nats.ErrTimeout {
					continue
				}
				log.Printf("Error fetching messages: %v", err)
				time.Sleep(5 * time.Second)
				continue
			}

			for _, msg := range msgs {
				var task Task
				if err := json.Unmarshal(msg.Data, &task); err != nil {
					log.Printf("Failed to parse task: %v", err)
					msg.Ack()
					continue
				}

				log.Printf("Received task: ID=%d, Type=%s", task.ID, task.Type)

				// Execute task
				if executeTask(&task, *macAddress, *pxeServer) {
					msg.Ack()
					log.Printf("Task %d completed successfully", task.ID)
				} else {
					log.Printf("Task %d failed, will retry", task.ID)
					// Don't ack, let NATS retry
				}
			}
		}
	}()

	// Wait for shutdown signal
	<-sigChan
	log.Printf("Shutting down...")
}

func executeTask(task *Task, macAddress, pxeServer string) bool {
	log.Printf("Executing task %d: type=%s", task.ID, task.Type)

	switch task.Type {
	case "reboot":
		// Report success before rebooting
		reportTaskCompletion(pxeServer, macAddress, task.ID, true, "Reboot command executed")
		log.Printf("Rebooting in 2 seconds...")
		time.Sleep(2 * time.Second)
		sync()
		exec.Command("reboot", "-f").Run()
		return true

	case "shutdown":
		// Report success before shutting down
		reportTaskCompletion(pxeServer, macAddress, task.ID, true, "Shutdown command executed")
		log.Printf("Shutting down in 2 seconds...")
		time.Sleep(2 * time.Second)
		sync()
		exec.Command("poweroff", "-f").Run()
		return true

	case "install":
		log.Printf("Install task received - should be handled by installer")
		reportTaskCompletion(pxeServer, macAddress, task.ID, false, "Install tasks should be handled by installer")
		return true

	default:
		log.Printf("Unknown task type: %s", task.Type)
		reportTaskCompletion(pxeServer, macAddress, task.ID, false, fmt.Sprintf("Unknown task type: %s", task.Type))
		return true
	}
}

func reportTaskCompletion(pxeServer, macAddress string, taskID int, success bool, result string) {
	url := fmt.Sprintf("%s/api/servers/%s/tasks/%d/complete", pxeServer, macAddress, taskID)
	payload := fmt.Sprintf(`{"success":%t,"result":"%s"}`, success, result)

	cmd := exec.Command("curl", "-s", "-X", "POST", url,
		"-H", "Content-Type: application/json",
		"-d", payload)
	cmd.Run() // Ignore errors, we're about to reboot/shutdown anyway
}

func sync() {
	exec.Command("sync").Run()
}
