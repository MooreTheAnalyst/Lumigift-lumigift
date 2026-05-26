import axios from "axios";
import { serverConfig } from "@/server/config";

const paystackClient = axios.create({
  baseURL: "https://api.paystack.co",
  headers: {
    Authorization: `Bearer ${serverConfig.paystack.secretKey}`,
    "Content-Type": "application/json",
  },
});

export interface InitializePaymentParams {
  email: string;
  amountKobo: number; // Paystack uses kobo (1 NGN = 100 kobo)
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitializePaymentResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

/**
 * Initializes a Paystack payment session and returns the checkout URL.
 *
 * @param params - Payment parameters including email, amount in kobo, reference,
 *   callback URL, and optional metadata.
 * @returns An object containing the `authorizationUrl` to redirect the user to,
 *   the `accessCode`, and the `reference`.
 * @throws If the Paystack API returns a non-2xx response.
 */
export async function initializePayment(
  params: InitializePaymentParams
): Promise<InitializePaymentResult> {
  const { data } = await paystackClient.post("/transaction/initialize", {
    email: params.email,
    amount: params.amountKobo,
    reference: params.reference,
    callback_url: params.callbackUrl,
    metadata: params.metadata,
  });

  return {
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference,
  };
}

/**
 * Verifies a Paystack transaction by its reference string.
 *
 * @param reference - The unique transaction reference (e.g. `lumigift_<uuid>`).
 * @returns An object with the transaction `status`, `amountKobo`, and `reference`.
 * @throws If the Paystack API returns a non-2xx response.
 */
export async function verifyPayment(reference: string): Promise<{
  status: "success" | "failed" | "pending";
  amountKobo: number;
  reference: string;
}> {
  const { data } = await paystackClient.get(`/transaction/verify/${reference}`);
  return {
    status: data.data.status,
    amountKobo: data.data.amount,
    reference: data.data.reference,
  };
}

/**
 * Converts a Nigerian Naira amount to kobo (Paystack's smallest currency unit).
 * 1 NGN = 100 kobo.
 *
 * @param ngn - Amount in Nigerian Naira.
 * @returns The equivalent amount in kobo, rounded to the nearest integer.
 */
export const ngnToKobo = (ngn: number) => Math.round(ngn * 100);

/**
 * Initiates a refund for a Paystack transaction.
 *
 * @param reference - The transaction reference to refund.
 * @returns An object containing the refund `status`.
 * @throws If the Paystack API returns a non-2xx response.
 */
export async function refundPayment(reference: string): Promise<{ status: string }> {
  const { data } = await paystackClient.post("/refund", { transaction: reference });
  return { status: data.data.status };
}
