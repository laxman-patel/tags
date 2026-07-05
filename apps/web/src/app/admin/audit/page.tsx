import { redirect } from "next/navigation";

export default function AdminAuditRedirect() {
  redirect("/?view=audit");
}
