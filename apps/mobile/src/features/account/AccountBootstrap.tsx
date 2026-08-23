"use client";

import { useEffect } from "react";
import { bootstrapAccountSession } from "./accountService";

export function AccountBootstrap() {
  useEffect(() => {
    void bootstrapAccountSession();
  }, []);

  return null;
}
