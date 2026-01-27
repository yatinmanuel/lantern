'use client';

import { IsoManager } from '@/components/iso-manager';

export default function ImagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Images</h1>
        <p className="text-muted-foreground">Manage boot images and PXE menu entries</p>
      </div>
      <IsoManager />
    </div>
  );
}
