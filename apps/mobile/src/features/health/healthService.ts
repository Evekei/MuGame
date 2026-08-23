import { getHealth } from "@/lib/api/client";

export function readHealth() {
  return getHealth();
}
