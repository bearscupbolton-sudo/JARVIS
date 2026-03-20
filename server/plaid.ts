import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export function mapPlaidAccountType(type: string, subtype: string | null): string {
  if (type === "credit") return "credit_card";
  if (type === "depository") {
    if (subtype === "savings") return "savings";
    if (subtype === "checking") return "checking";
    return "checking";
  }
  if (type === "loan") return "loan";
  return "checking";
}

export { Products, CountryCode };
