import { redirect } from "next/navigation";

export default function NewSpaceRedirect() {
  redirect("/?view=new-space");
}
