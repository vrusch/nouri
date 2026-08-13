import { useState } from "react";
import { X, Trash2, Loader2 } from "lucide-react";
import { type ProgressPhotoEntry } from "../lib/cloudSync";

interface ProgressPhotoLightboxProps {
  photo: ProgressPhotoEntry;
  onClose: () => void;
  onDelete: (photo: ProgressPhotoEntry) => Promise<void>;
}

function formatDateCs(dateISO: string): string {
  return new Date(`${dateISO}T00:00:00`).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
}

export default function ProgressPhotoLightbox({ photo, onClose, onDelete }: ProgressPhotoLightboxProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await onDelete(photo);
      onClose();
    } catch (error) {
      console.error("Smazání progress fotky selhalo:", error);
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md flex flex-col items-center gap-4">
        <div className="w-full flex items-center justify-between">
          <span className="text-white text-sm font-bold">{formatDateCs(photo.date)}</span>
          <button onClick={onClose} aria-label="Zavřít" className="p-1.5 text-white/80 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <img src={photo.downloadURL} alt={`Progress fotka ${photo.date}`} className="w-full max-h-[65dvh] object-contain rounded-2xl" />
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold active:scale-[0.98] transition-all disabled:opacity-50 ${
            confirmDelete ? "bg-red-600 text-white" : "bg-white/10 text-white"
          }`}
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          {confirmDelete ? "Opravdu smazat? Klikni znovu" : "Smazat fotku"}
        </button>
        {deleteFailed && <p className="text-xs text-red-400">Smazání se nepovedlo, zkus to prosím znovu.</p>}
      </div>
    </div>
  );
}
