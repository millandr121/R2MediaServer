import { useEffect, useState } from "react";
import { Eye, EyeOff, Film, Plus, Trash2, Check } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { FileItem, StockItem } from "../lib/types";
import { formatPrice } from "../lib/format";
import { FilePicker } from "../components/FilePicker";
import { Modal, Spinner, EmptyState, toast } from "../components/ui";

type PickerFor = "master" | "preview" | "thumbnail" | null;

export function StockAdmin() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // create form
  const [master, setMaster] = useState<FileItem | null>(null);
  const [preview, setPreview] = useState<FileItem | null>(null);
  const [thumbnail, setThumbnail] = useState<FileItem | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [tags, setTags] = useState("");
  const [pickerFor, setPickerFor] = useState<PickerFor>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems((await api.stock.adminAll()).items);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setMaster(null);
    setPreview(null);
    setThumbnail(null);
    setTitle("");
    setDescription("");
    setPrice("");
    setTags("");
  };

  const create = async () => {
    if (!master) return toast("Select a master file", "error");
    if (!title.trim()) return toast("Enter a title", "error");
    setSaving(true);
    try {
      await api.stock.create({
        fileId: master.id,
        previewFileId: preview?.id,
        thumbnailFileId: thumbnail?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        priceCents: Math.round(parseFloat(price || "0") * 100),
        currency: "usd",
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        published: true,
      });
      toast("Listing created", "success");
      setCreating(false);
      resetForm();
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to create listing", "error");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (item: StockItem) => {
    try {
      await api.stock.update(item.id, { published: !item.published });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, published: !i.published } : i)));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Update failed", "error");
    }
  };

  const remove = async (item: StockItem) => {
    if (!confirm(`Delete listing "${item.title}"? The underlying file is not deleted.`)) return;
    try {
      await api.stock.remove(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast("Listing deleted", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Delete failed", "error");
    }
  };

  const selectPicked = (file: FileItem) => {
    if (pickerFor === "master") setMaster(file);
    else if (pickerFor === "preview") setPreview(file);
    else if (pickerFor === "thumbnail") setThumbnail(file);
    setPickerFor(null);
  };

  const FileField = ({ label, value, kind }: { label: string; value: FileItem | null; kind: PickerFor }) => (
    <div>
      <label className="label">{label}</label>
      <button onClick={() => setPickerFor(kind)} className="btn-outline w-full justify-start">
        {value ? (
          <span className="flex items-center gap-2 truncate">
            <Check className="h-4 w-4 text-emerald-400" /> {value.name}
          </span>
        ) : (
          <span className="text-slate-500">Select a file…</span>
        )}
      </button>
    </div>
  );

  return (
    <div className="px-5 py-5 sm:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Manage store</h1>
          <p className="text-sm text-slate-400">Publish stock footage and digital products for sale.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New listing
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner className="h-7 w-7 text-accent" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Film className="h-12 w-12" />} title="No listings yet" hint="Create your first listing to start selling." />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="card flex items-center gap-3 p-3">
              <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md bg-ink-800">
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Film className="h-5 w-5 text-slate-600" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                  {!item.published && (
                    <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-slate-400">Draft</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{formatPrice(item.priceCents, item.currency)}</p>
              </div>
              <button onClick={() => togglePublish(item)} className="btn-ghost h-9 w-9 !p-0" title={item.published ? "Unpublish" : "Publish"}>
                {item.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
              <button onClick={() => remove(item)} className="btn-ghost h-9 w-9 !p-0 text-red-400 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New listing" width="max-w-lg">
        <div className="space-y-4">
          <FileField label="Master file (delivered after purchase)" value={master} kind="master" />
          <div className="grid grid-cols-2 gap-3">
            <FileField label="Preview (watermarked)" value={preview} kind="preview" />
            <FileField label="Thumbnail" value={thumbnail} kind="thumbnail" />
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mountain Sunrise 4K" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[72px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Aerial drone footage, 4K 60fps…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Price (USD)</label>
              <input className="input" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="49.00" />
            </div>
            <div>
              <label className="label">Tags (comma-separated)</label>
              <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="4k, nature, aerial" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setCreating(false)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={create} className="btn-primary" disabled={saving}>
              {saving && <Spinner className="h-4 w-4" />}
              Create listing
            </button>
          </div>
        </div>
      </Modal>

      {pickerFor && (
        <FilePicker
          title={`Choose ${pickerFor} file`}
          onSelect={selectPicked}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
