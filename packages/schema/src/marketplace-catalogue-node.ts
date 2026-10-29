import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { MARKETPLACE_CATALOGUE_PUBLIC_KEY_BASE64 } from "./marketplace-catalogue.js";

function publicKeyFromRaw(raw: Buffer) {
  return createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      raw,
    ]),
    format: "der",
    type: "spki",
  });
}

export function verifyCatalogueIndexSignatureNode(
  indexBytes: Uint8Array,
  signatureBase64: string,
  publicKeyBase64: string = MARKETPLACE_CATALOGUE_PUBLIC_KEY_BASE64,
): boolean {
  const signature = Buffer.from(signatureBase64.trim(), "base64");
  const publicKey = publicKeyFromRaw(
    Buffer.from(publicKeyBase64, "base64"),
  );
  return verifySignature(null, Buffer.from(indexBytes), publicKey, signature);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
