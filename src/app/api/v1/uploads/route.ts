import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import type { ApiResponse } from "@/types";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const UPLOAD_FOLDER = "gift-media";

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

  // Validate MIME type before upload
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: `Invalid file type "${file.type}". Allowed: jpeg, png, webp, gif`,
      },
      { status: 400 }
    );
  }

  // Validate file size before upload
  if (file.size > MAX_BYTES) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "File exceeds the 5 MB size limit" },
      { status: 400 }
    );
  }

  // Upload to Cloudinary server-side using a signed request
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp, folder: UPLOAD_FOLDER };
  const signature = sign(params);

  const cloudForm = new FormData();
  cloudForm.append("file", file);
  cloudForm.append("timestamp", String(timestamp));
  cloudForm.append("folder", UPLOAD_FOLDER);
  cloudForm.append("api_key", process.env.CLOUDINARY_API_KEY ?? "");
  cloudForm.append("signature", signature);

  const cloudRes = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
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
