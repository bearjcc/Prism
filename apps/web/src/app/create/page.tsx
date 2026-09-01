import type { Metadata } from "next";
import { CreateForm } from "../../components/create-form";
import { SiteShell } from "../../components/site-shell";

export const metadata: Metadata = { title: "Create" };

export default function CreatePage() {
  return (
    <SiteShell current="create">
      <div className="page-head">
        <h1>Create</h1>
        <p>Publish a package or import UserCSS. Userscripts are a translate path, not a drop-in runtime.</p>
      </div>
      <CreateForm />
    </SiteShell>
  );
}
