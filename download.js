// Temporary testing only.
// This disables SSL certificate verification for this Node.js process.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const fs = require("fs");
const path = require("path");

// ======================================================
// PASTE A FRESH VISTA TOKEN HERE
// You can paste it with or without the word "Bearer".
// ======================================================
const TOKEN = `PASTE_YOUR_COMPLETE_TOKEN_HERE`;

// ======================================================
// REPORT CONFIGURATION
// ======================================================
const CONFIG = {
  baseUrl: "https://adpvistahcm.ad.esi.adp.com",

  companyCode: "24X7tech",
  entityCode: "001",
  period: "2026APR",
  process: "All",
  fileType: "xlsx",

  downloadFolder: path.join(__dirname, "downloads"),
};

// PT and LWF API details
const REPORTS = [
  {
    name: "PT",
    endpoint: "GetPTaxReport",
  },
  {
    name: "LWF",
    endpoint: "GetLwfReport",
  },
];

/**
 * Removes "Bearer", spaces and line breaks from the copied token.
 */
function normalizeToken(token) {
  return token
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/\s+/g, "");
}

/**
 * Builds the complete PT or LWF API URL.
 */
function buildReportUrl(endpoint) {
  const companyCode = encodeURIComponent(CONFIG.companyCode);
  const entityCode = encodeURIComponent(CONFIG.entityCode);
  const period = encodeURIComponent(CONFIG.period);
  const processName = encodeURIComponent(CONFIG.process);
  const fileType = encodeURIComponent(CONFIG.fileType);

  return (
    `${CONFIG.baseUrl}/ESSAPI/v1/VistaReports/Statutory/` +
    `${endpoint}/${companyCode}/${entityCode}/${period}/` +
    `${processName}?fileType=${fileType}`
  );
}

/**
 * Removes characters that Windows does not permit in filenames.
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();
}

/**
 * Gets the real filename returned by the Vista API.
 */
function getFilename(contentDisposition, fallbackFilename) {
  if (!contentDisposition) {
    return fallbackFilename;
  }

  // Example:
  // filename*=UTF-8''PTMonthlyReport.zip
  const utf8Match = contentDisposition.match(
    /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i,
  );

  if (utf8Match) {
    let filename = utf8Match[1]
      .replace(/^["']|["']$/g, "")
      .trim();

    try {
      filename = decodeURIComponent(filename);
    } catch {
      // Use the original filename when decoding fails.
    }

    return sanitizeFilename(filename);
  }

  // Example:
  // filename="PTMonthlyReport.zip"
  const normalMatch = contentDisposition.match(
    /filename\s*=\s*"([^"]+)"/i,
  );

  if (normalMatch) {
    return sanitizeFilename(normalMatch[1]);
  }

  // Example:
  // filename=PTMonthlyReport.zip
  const unquotedMatch = contentDisposition.match(
    /filename\s*=\s*([^;]+)/i,
  );

  if (unquotedMatch) {
    return sanitizeFilename(
      unquotedMatch[1]
        .replace(/^["']|["']$/g, "")
        .trim(),
    );
  }

  return fallbackFilename;
}

/**
 * Waits before starting the next request.
 */
function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Downloads one PT or LWF report.
 */
async function downloadReport(report, authorizationToken) {
  const reportUrl = buildReportUrl(report.endpoint);

  console.log("\n====================================");
  console.log(`Requesting ${report.name} report`);
  console.log("====================================");
  console.log(`Company : ${CONFIG.companyCode}`);
  console.log(`Entity  : ${CONFIG.entityCode}`);
  console.log(`Period  : ${CONFIG.period}`);
  console.log(`Process : ${CONFIG.process}`);
  console.log(`URL     : ${reportUrl}`);

  try {
    const response = await fetch(reportUrl, {
      method: "GET",

      headers: {
        Authorization: `Bearer ${authorizationToken}`,
        Accept: "application/json, text/plain, */*",
        "Cache-Control": "no-cache",
      },
    });

    console.log(
      `${report.name}: ${response.status} ${response.statusText}`,
    );

    // Read the response only once.
    const responseBuffer = Buffer.from(
      await response.arrayBuffer(),
    );

    // Handle 400, 401, 403 and other API errors.
    if (!response.ok) {
      const errorMessage =
        responseBuffer.toString("utf8") ||
        "The server returned no error message.";

      console.error(`${report.name} failed.`);
      console.error(`Server response: ${errorMessage}`);

      const errorFilename = sanitizeFilename(
        `${report.name}_${CONFIG.companyCode}_${CONFIG.entityCode}_${CONFIG.period}_error.txt`,
      );

      const errorPath = path.join(
        CONFIG.downloadFolder,
        errorFilename,
      );

      const errorDetails = [
        `Report: ${report.name}`,
        `HTTP Status: ${response.status}`,
        `Status Text: ${response.statusText}`,
        `Company: ${CONFIG.companyCode}`,
        `Entity: ${CONFIG.entityCode}`,
        `Period: ${CONFIG.period}`,
        `Process: ${CONFIG.process}`,
        `URL: ${reportUrl}`,
        "",
        "Server response:",
        errorMessage,
      ].join("\n");

      fs.writeFileSync(errorPath, errorDetails, "utf8");

      console.log(`Error details saved at: ${errorPath}`);

      return {
        report: report.name,
        success: false,
        status: response.status,
        message: errorMessage,
      };
    }

    const contentDisposition = response.headers.get(
      "content-disposition",
    );

    const contentType =
      response.headers.get("content-type") || "";

    console.log(`Content-Type: ${contentType}`);

    const fallbackFilename = sanitizeFilename(
      `${report.name}_${CONFIG.companyCode}_${CONFIG.entityCode}_${CONFIG.period}.zip`,
    );

    const filename = getFilename(
      contentDisposition,
      fallbackFilename,
    );

    const outputPath = path.join(
      CONFIG.downloadFolder,
      filename,
    );

    fs.writeFileSync(outputPath, responseBuffer);

    console.log(`${report.name} downloaded successfully.`);
    console.log(`Filename: ${filename}`);
    console.log(`Saved at: ${outputPath}`);
    console.log(`File size: ${responseBuffer.length} bytes`);

    return {
      report: report.name,
      success: true,
      status: response.status,
      outputPath,
    };
  } catch (error) {
    console.error(`${report.name} network error:`);
    console.error(error.message);

    if (error.cause) {
      console.error("Underlying cause:", error.cause);
    }

    return {
      report: report.name,
      success: false,
      status: "NETWORK_ERROR",
      message: error.message,
    };
  }
}

/**
 * Starts the PT and LWF report download.
 */
async function main() {
  const authorizationToken = normalizeToken(TOKEN);

  if (
    !authorizationToken ||
    authorizationToken.includes("PASTE_YOUR")
  ) {
    throw new Error(
      "Paste a fresh Vista Bearer token inside the TOKEN variable.",
    );
  }

  fs.mkdirSync(CONFIG.downloadFolder, {
    recursive: true,
  });

  console.log("Vista PT and LWF report download started.");
  console.log(`Download folder: ${CONFIG.downloadFolder}`);

  const results = [];

  for (const report of REPORTS) {
    const result = await downloadReport(
      report,
      authorizationToken,
    );

    results.push(result);

    // Wait two seconds before requesting the next report.
    await wait(2000);
  }

  console.log("\n====================================");
  console.log("DOWNLOAD SUMMARY");
  console.log("====================================");

  for (const result of results) {
    if (result.success) {
      console.log(
        `${result.report}: SUCCESS — HTTP ${result.status}`,
      );
    } else {
      console.log(
        `${result.report}: FAILED — ${result.status}`,
      );
    }
  }

  console.log("\nProcess completed.");
}

main().catch((error) => {
  console.error("\nProgram failed:");
  console.error(error.message);

  process.exitCode = 1;
});
