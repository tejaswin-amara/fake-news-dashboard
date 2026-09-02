import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const demoUser: User = {
  id: 1,
  openId: "local-demo-user",
  name: "Local Demo User",
  email: "demo@localhost",
  loginMethod: "local-demo",
  role: "admin",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(),
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  if (process.env.LOCAL_DEMO_MODE === "true") {
    return { req: opts.req, res: opts.res, user: demoUser };
  }

  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }
  return { req: opts.req, res: opts.res, user };
}
