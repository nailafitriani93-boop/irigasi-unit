import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | Dashboard Kesiapan Irigasi",
  description: "Masuk ke Dashboard Kesiapan Irigasi Estate PG 1.",
};

export default function SignIn() {
  return <SignInForm />;
}
