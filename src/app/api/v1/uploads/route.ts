import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import type { ApiResponse } from "@/types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // 4 MB (~30s at 128 kbps)
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"]);
const IMAGE_FOLDER = "gift-media";
const AUDIO_FOLDER = "gift-voice-notes";

function sign(params: Record<string, string | number>): string {
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!secret) throw new Error("CLOUDINARY_API_SECRET is not set");
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha256").update(payload + secret).digest("hex");
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Request must be multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Missing file field" },
      { status: 400 }
    );
  }

  const isAudio = ALLOWED_AUDIO_TYPES.has(file.type);
  const isImage = ALLOWED_IMAGE_TYPES.has(file.type);

  if (!isImage && !isAudio) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: `Invalid file type "${file.type}". Allowed image: jpeg, png, webp, gif. Allowed audio: webm, mp4, ogg, wav`,
      },
      { status: 400 }
    );
  }

  const maxBytes = isAudio ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
  const sizeLabel = isAudio ? "4 MB" : "5 MB";
  if (file.size > maxBytes) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `File exceeds the ${sizeLabel} size limit` },
      { status: 400 }
    );
  }

  const folder = isAudio ? AUDIO_FOLDER : IMAGE_FOLDER;
  const resourceType = isAudio ? "video" : "image"; // Cloudinary uses "video" for audio

  // Upload to Cloudinary server-side using a signed request
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp, folder };
  const signature = sign(params);

  const cloudForm = new FormData();
  cloudForm.append("file", file);
  cloudForm.append("timestamp", String(timestamp));
  cloudForm.append("folder", folder);
  cloudForm.append("api_key", process.env.CLOUDINARY_API_KEY ?? "");
  cloudForm.append("signature", signature);

  const cloudRes = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    { method: "POST", body: cloudForm }
  );

  if (!cloudRes.ok) {
    const err = await cloudRes.json().catch(() => ({}));
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: (err as { error?: { message?: string } })?.error?.message ?? "Upload failed" },
      { status: 502 }
    );
  }

  const data = await cloudRes.json() as { secure_url: string; public_id: string };
  return NextResponse.json<ApiResponse<{ url: string; publicId: string }>>({
    success: true,
    data: { url: data.secure_url, publicId: data.public_id },
  });
}
