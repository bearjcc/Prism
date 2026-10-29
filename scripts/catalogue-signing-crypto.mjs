import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { Buffer } from "node:buffer";

const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function privateKeyFromSeedBase64(seedBase64) {
  const seed = Buffer.from(seedBase64.trim(), "base64");
  if (seed.length !== 32) {
    throw new Error("Catalogue signing private key must be 32 bytes (base64)");
  }
  return createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

export function publicKeyFromSeedBase64(seedBase64) {
  const seed = Buffer.from(seedBase64.trim(), "base64");
  if (seed.length !== 32) {
    throw new Error("Catalogue signing public key must be 32 bytes (base64)");
  }
  return createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, seed]),
    format: "der",
    type: "spki",
  });
}

export function derivePublicKeyBase64FromPrivateSeed(privateSeedBase64) {
  const privateKey = privateKeyFromSeedBase64(privateSeedBase64);
  const publicKey = createPublicKey(privateKey);
  const der = publicKey.export({ format: "der", type: "spki" });
  return Buffer.from(der).subarray(-32).toString("base64");
}

export function signCatalogueIndexBytes(indexBytes, privateSeedBase64) {
  const privateKey = privateKeyFromSeedBase64(privateSeedBase64);
  return sign(null, Buffer.from(indexBytes), privateKey);
}

export function verifyCatalogueIndexBytes(
  indexBytes,
  signatureBase64,
  publicSeedBase64,
) {
  const signature = Buffer.from(signatureBase64.trim(), "base64");
  const publicKey = publicKeyFromSeedBase64(publicSeedBase64);
  return verify(null, Buffer.from(indexBytes), publicKey, signature);
}

export function generateEd25519KeypairSeedsBase64() {
  const pair = generateKeyPairSync("ed25519");
  const privateDer = pair.privateKey.export({ format: "der", type: "pkcs8" });
  const publicDer = pair.publicKey.export({ format: "der", type: "spki" });
  return {
    privateKeyBase64: Buffer.from(privateDer).subarray(-32).toString("base64"),
    publicKeyBase64: Buffer.from(publicDer).subarray(-32).toString("base64"),
  };
}
