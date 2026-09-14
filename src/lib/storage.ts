import "server-only";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { requiredEnv } from "./env";
import { AppError } from "./errors";
export function storage() {
  cloudinary.config({
    cloud_name: requiredEnv("CLOUDINARY_CLOUD_NAME"),
    api_key: requiredEnv("CLOUDINARY_API_KEY"),
    api_secret: requiredEnv("CLOUDINARY_API_SECRET"),
    secure: true,
  });
  return cloudinary;
}
export function validateImage(bytes: Buffer, type: string) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP";
  if (!(
    (jpeg && type === "image/jpeg") ||
    (png && type === "image/png") ||
    (webp && type === "image/webp")
  ))
    throw new AppError("Choose a JPG, PNG or WebP screenshot.");
  if (bytes.length > 3 * 1024 * 1024 || bytes.length < 12)
    throw new AppError("Choose an image smaller than 3 MB.");
}
export async function uploadScreenshot(bytes: Buffer, publicId: string) {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    storage()
      .uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: "image",
          type: "authenticated",
          overwrite: false,
          allowed_formats: ["jpg", "png", "webp"],
          transformation: [{ width: 1800, height: 2400, crop: "limit" }],
          timeout: 30000,
        },
        (error, result) =>
          error || !result
            ? reject(
                new AppError(
                  "Screenshot upload failed. Please try again.",
                  502,
                ),
              )
            : resolve(result),
      )
      .end(bytes);
  });
}
