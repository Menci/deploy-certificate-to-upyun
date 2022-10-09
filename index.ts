import fs from "fs";
import https from "https";
import { URL } from "url";
import * as core from "@actions/core";
import Axios, { Method } from "axios";
import { Cookie } from "tough-cookie";

const input = {
  subaccountUsername: core.getInput("subaccount-username"),
  subaccountPassword: core.getInput("subaccount-password"),
  fullchainFile: core.getInput("fullchain-file"),
  keyFile: core.getInput("key-file"),
  domains: core.getInput("domains"),
  deleteUnusedCertificates: core.getBooleanInput("delete-unused-certificates")
};

const cookies: Record<string, string> = {};
async function callApi<ResponseData>(url: string, data: Record<string, unknown>, method: Method = "POST") {
  interface UpyunConsoleApiResponse {
    data: ResponseData;
    msg: {
      errors: string[];
      messages: string[];
    }
    user: unknown;
  }

  const result = await Axios.request({
    maxRedirects: 0,
    validateStatus: () => true,
    method,
    url,
    data,
    headers: {
      Cookie: Object.values(cookies).join("; ")
    },
    httpsAgent: new https.Agent({
      lookup: (_hostname, _options, callback) => callback(null, "101.251.144.15", 4)
    })
  });
  const response = result.data as UpyunConsoleApiResponse;
  console.log(`${url}:`, result.status, response);

  const setCookieHeader = result.headers["set-cookie"];
  const setCookieHeaders = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  setCookieHeaders.filter(x => x).map<any>(Cookie.parse).forEach(cookie => cookies[cookie.key] = cookie.cookieString());

  return response.data;
}

async function login() {
  const responseData = await callApi<{ result: boolean }>(
    "https://console.upyun.com/accounts/signin/",
    {
      username: input.subaccountUsername,
      password: input.subaccountPassword
    }
  );

  if (!responseData.result) {
    throw new Error(`Failed to login: ${JSON.stringify(responseData)}`);
  }
}

async function uploadCertificate() {
  const fullchain = fs.readFileSync(input.fullchainFile, "utf-8");
  const key = fs.readFileSync(input.keyFile, "utf-8");

  const responseData = await callApi<{ status: number; result: { certificate_id: string } }>(
    "https://console.upyun.com/api/https/certificate/",
    {
      certificate: fullchain,
      private_key: key
    }
  );

  if (responseData.status !== 0) {
    throw new Error(`Failed to upload certificate: ${JSON.stringify(responseData)}`);
  }

  return responseData.result.certificate_id;
}

async function deployCertificate(id: string) {
  const domains = Array.from(new Set(input.domains.split(/\s+/).filter(x => x)));
  
  for (const domain of domains) {
    console.log(`Deploying certificate to domain ${domain}.`);

    const responseData = await callApi<{ result: boolean }>(
      "https://console.upyun.com/api/https/migrate/domain",
      {
        crt_id: id,
        domain_name: domain
      }
    );

    if (!responseData.result) {
      throw new Error(`Failed to deploy certificate to domain "${domain}": ${JSON.stringify(responseData)}`);
    }
  }
}

async function deleteUnusedCertificates() {
  async function listUnusedCertificates(callback: (id: string) => Promise<void>) {
    let pager = {
      since: null as number,
      max: null as number,
      limit: 10
    };

    while (true) {
      const url = new URL("https://console.upyun.com/api/https/certificate/list/");
      for (const key in pager) if (pager[key] != null) url.searchParams.set(key, String(pager[key]));

      const responseData = await callApi<{ result: Record<string, { config_domain: number }>; pager: typeof pager; status: number }>(
        url.toString(),
        undefined,
        "GET"
      );

      if (responseData.status !== 0) {
        throw new Error(`Failed to list certificates: ${JSON.stringify(responseData)}`);
      }

      for (const id in responseData.result) {
        if (id !== "default" && responseData.result[id].config_domain === 0)
          await callback(id);
      }

      pager = responseData.pager;
      if (pager.max == null) break;
    }
  }

  await listUnusedCertificates(async id => {
    const responseData = await callApi<{ status: boolean }>(
      `https://console.upyun.com/api/https/certificate/?certificate_id=${id}`,
      undefined,
      "DELETE"
    );

    if (responseData.status !== true) {
      throw new Error(`Failed to delete unused certificate ${id}: ${JSON.stringify(responseData)}`);
    }
  });
}

async function main() {
  await login();

  const id = await uploadCertificate();

  if (input.domains) await deployCertificate(id);

  if (input.deleteUnusedCertificates) await deleteUnusedCertificates();
}

main().catch(error => {
  console.log(error.stack);
  core.setFailed(error);
  process.exit(1);
});
