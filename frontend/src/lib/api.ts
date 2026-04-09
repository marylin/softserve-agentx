const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function createIncident(
  data: {
    title: string;
    description: string;
    reporter_email: string;
    reporter_name: string;
  },
  files: File[]
): Promise<{ id: string; status: string }> {
  const form = new FormData();
  form.append("title", data.title);
  form.append("description", data.description);
  form.append("reporter_email", data.reporter_email);
  form.append("reporter_name", data.reporter_name);
  for (const file of files) {
    form.append("files", file);
  }
  const res = await fetch(`${API_URL}/incidents/`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Failed to create incident: ${res.statusText}`);
  return res.json();
}

export async function suggestDescription(
  title: string,
  affectedArea: string
): Promise<string> {
  const form = new FormData();
  form.append("title", title);
  form.append("affected_area", affectedArea);
  const res = await fetch(`${API_URL}/incidents/suggest`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Failed to get suggestion");
  const data = await res.json();
  return data.suggestion;
}

export async function getIncident(id: string) {
  const res = await fetch(`${API_URL}/incidents/${id}`);
  if (!res.ok) throw new Error(`Failed to get incident: ${res.statusText}`);
  return res.json();
}

export async function listIncidents() {
  const res = await fetch(`${API_URL}/incidents/`);
  if (!res.ok) throw new Error(`Failed to list incidents: ${res.statusText}`);
  return res.json();
}

export async function getSimilarIncidents(id: string) {
  const res = await fetch(`${API_URL}/incidents/${id}/similar`);
  if (!res.ok) return [];
  return res.json();
}
