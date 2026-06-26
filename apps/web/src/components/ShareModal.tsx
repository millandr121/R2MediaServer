import { useState } from "react";
import { Copy, Check, Link2, Globe } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Share } from "../lib/types";
import { Modal, Spinner, toast } from "./ui";

/** A read-only URL field with its own copy button. */
function CopyRow({
  url,
  icon,
  copied,
  onCopy,
}: {
  url: string;
  icon: React.ReactNode;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950 p-2">
      {icon}
      <input readOnly value={url} className="flex-1 bg-transparent text-sm text-slate-800 outline-none" />
      <button onClick={onCopy} className="btn-primary h-8">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

const EXPIRY_OPTIONS = [
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
  { label: "Never", hours: 0 },
];

export function ShareModal({
  resourceType,
  resourceId,
  resourceName,
  onClose,
  onCreated,
}: {
  resourceType: "file" | "folder";
  resourceId: string;
  resourceName: string;
  onClose: () => void;
  onCreated?: (share: Share) => void;
}) {
  const [expiry, setExpiry] = useState(72);
  const [password, setPassword] = useState("");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [allowUpload, setAllowUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [copiedField, setCopiedField] = useState<"human" | "website" | null>(null);

  const create = async () => {
    setBusy(true);
    try {
      const { share } = await api.shares.create({
        resourceType,
        resourceId,
        password: password || undefined,
        expiresInHours: expiry || undefined,
        maxDownloads: maxDownloads ? Number(maxDownloads) : undefined,
        allowUpload: resourceType === "folder" ? allowUpload : undefined,
      });
      setShare(share);
      onCreated?.(share);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to create link", "error");
    } finally {
      setBusy(false);
    }
  };

  const copy = (value: string, field: "human" | "website") => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast("Link copied", "success");
    setTimeout(() => setCopiedField(null), 1500);
  };

  // The website/manifest link reuses the same token, just a different path.
  // Only meaningful for password-free folder shares (the API blocks manifest
  // on password-protected or single-file shares).
  const websiteUrl =
    share && share.resourceType === "folder" && !share.hasPassword
      ? `${new URL(share.url).origin}/api/public/shares/${share.token}/manifest`
      : null;

  return (
    <Modal open onClose={onClose} title={share ? "Share link ready" : "Create share link"}>
      {share ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Anyone with this link {share.hasPassword ? "and the password " : ""}can access{" "}
            <span className="text-slate-800">{resourceName}</span>.
          </p>

          <div>
            <label className="label">
              Share link <span className="font-normal text-slate-500">— for people</span>
            </label>
            <CopyRow
              url={share.url}
              icon={<Link2 className="ml-1 h-4 w-4 shrink-0 text-slate-500" />}
              copied={copiedField === "human"}
              onCopy={() => copy(share.url, "human")}
            />
          </div>

          {websiteUrl && (
            <div>
              <label className="label">
                Website link <span className="font-normal text-slate-500">— for your site &amp; code</span>
              </label>
              <CopyRow
                url={websiteUrl}
                icon={<Globe className="ml-1 h-4 w-4 shrink-0 text-accent" />}
                copied={copiedField === "website"}
                onCopy={() => copy(websiteUrl, "website")}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Give this one to your website / Claude. It returns a live list of every file in this folder to embed
                on bamfieldmediahouse.ca. New uploads show up within ~5 minutes — no rebuild needed.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={onClose} className="btn-outline">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Expires after</label>
            <div className="flex flex-wrap gap-2">
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.hours}
                  onClick={() => setExpiry(o.hours)}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    expiry === o.hours
                      ? "bg-accent text-white"
                      : "border border-ink-700 text-slate-700 hover:bg-ink-800"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Password (optional)</label>
            <input
              className="input"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for no password"
            />
          </div>
          <div>
            <label className="label">Max downloads (optional)</label>
            <input
              className="input"
              type="number"
              min={1}
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          {resourceType === "folder" && (
            <label className="flex items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allowUpload}
                onChange={(e) => setAllowUpload(e.target.checked)}
                className="h-4 w-4 rounded border-ink-600 bg-ink-900 text-accent focus:ring-accent"
              />
              Allow visitors to upload files (drop-box)
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button onClick={create} className="btn-primary" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />}
              Create link
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
