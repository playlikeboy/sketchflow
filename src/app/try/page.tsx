import { redirect } from "next/navigation";

// /try used to be a separate scratch editor. Sketchflow now works without signing in, so the
// page opens the app itself; a leftover scratch sketch becomes a project on "This device".
export default function TryPage() {
	redirect("/app");
}
