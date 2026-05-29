import { NextRequest, NextResponse } from "next/server";
import { serviceLogger } from "@/lib/logger";

const log = serviceLogger("csp-report");

interface CspReport {
  "csp-report": {
    "document-uri": string;
    "violated-directive": string;
    "effective-directive": string;
    "original-policy": string;
    "blocked-uri": string;
    "status-code": number;
    "source-file"?: string;
    "line-number"?: number;
    "column-number"?: number;
  };
}

export async function POST(req: NextRequest) {
  try {
    const report = (await req.json()) as CspReport;

    // Log CSP violation for monitoring
    log.warn(
      {
        documentUri: report["csp-report"]["document-uri"],
        violatedDirective: report["csp-report"]["violated-directive"],
        blockedUri: report["csp-report"]["blocked-uri"],
        sourceFile: report["csp-report"]["source-file"],
        lineNumber: report["csp-report"]["line-number"],
      },
      "CSP violation reported"
    );

    // In production, you might want to:
    // 1. Store violations in database for analysis
    // 2. Alert on repeated violations
    // 3. Track violation trends

    return NextResponse.json({ success: true }, { status: 204 });
  } catch (err) {
    log.error({ err }, "Failed to process CSP report");
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
