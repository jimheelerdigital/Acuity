import { redirect } from "next/navigation";

export default function ContentFactoryRedirect() {
  redirect("/admin?tab=content-factory");
}
