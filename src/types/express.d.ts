import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string | null;
        full_name: string | null;
        is_active: boolean;
        is_superuser: boolean;
      };
      authSession?: {
        id: string;
        user_id: number;
        expires_at: string;
      };
    }
  }
}

export {};
