import React, { useState, useEffect } from "react";
import { Lock } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  supabaseUrl: string;
  supabaseKey: string;
  serverError?: string | null;
}

export default function UpdatePasswordForm({ supabaseUrl, supabaseKey, serverError }: Props) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const type = params.get("type");

    if (!accessToken || type !== "recovery") {
      window.location.href = "/auth/signin";
      return;
    }

    const supabase = createBrowserClient(supabaseUrl, supabaseKey);
    const refreshToken = params.get("refresh_token") ?? "";
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          window.location.href = "/auth/signin";
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        window.location.href = "/auth/signin";
      });
  }, [supabaseUrl, supabaseKey]);

  function validate() {
    if (!password) {
      setError("Password is required");
      return false;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return false;
    }
    return true;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) e.preventDefault();
  }

  if (!ready) return null;

  return (
    <form method="POST" action="/api/auth/update-password" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="password"
        label="New password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          setError(undefined);
        }}
        placeholder="At least 6 characters"
        error={error}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Updating..." icon={<Lock className="size-4" />}>
        Set new password
      </SubmitButton>
    </form>
  );
}
