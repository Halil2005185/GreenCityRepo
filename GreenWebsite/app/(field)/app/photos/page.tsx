import type { Metadata } from "next";

import { PhotosScreen } from "@/components/field/photos-screen";

export const metadata: Metadata = { title: "الصور" };

export default function FieldPhotosPage() {
  return <PhotosScreen />;
}
