import { useEffect, useRef, useState } from "react";
import { Camera, Download, Image as ImageIcon, LoaderCircle, Plus, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { ProgressPhoto } from "@shared/tracker";
import { formatDate, todayAsLocalDate } from "@/lib/tracker-utils";
import { deleteLocalProgressPhotoBlob, loadLocalProgressPhotoBlob, saveLocalProgressPhotoBlob } from "@/lib/local-data";
import { runForActiveOwner } from "@/lib/owner-guard";
import { getSupabaseClient, PROGRESS_PHOTO_BUCKET } from "@/lib/supabase";
import { prepareProgressPhoto } from "@/lib/progress-photos";

type Props = {
  userId: string;
  getActiveUserId: () => string | null;
  photos: ProgressPhoto[];
  offlineMode: boolean;
  canAccessAccountPhotos: boolean;
  onSave: (photo: ProgressPhoto, blob: Blob, expectedUserId: string) => Promise<void>;
  onRemove: (photo: ProgressPhoto) => Promise<void> | void;
};

type PhotoCardProps = {
  photo: ProgressPhoto;
  userId: string;
  getActiveUserId: () => string | null;
  offlineMode: boolean;
  online: boolean;
  canAccessAccountPhotos: boolean;
  onRemove: (photo: ProgressPhoto) => Promise<void> | void;
};

function ProgressPhotoCard({ photo, userId, getActiveUserId, offlineMode, online, canAccessAccountPhotos, onRemove }: PhotoCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [cacheChecked, setCacheChecked] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [downloadAttempt, setDownloadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    setCacheChecked(false);
    setLoadError(false);

    async function openPhoto() {
      try {
        const cached = await loadLocalProgressPhotoBlob(userId, photo.id).catch(() => null);
        if (cancelled) return;
        if (cached) {
          setImageUrl(URL.createObjectURL(cached));
          setCacheChecked(true);
          return;
        }
        setCacheChecked(true);
        if (!online || offlineMode || !canAccessAccountPhotos) return;

        const signedUrl = await runForActiveOwner(userId, getActiveUserId, async () => {
          const { data, error } = await getSupabaseClient()
            .storage.from(PROGRESS_PHOTO_BUCKET)
            .createSignedUrl(photo.storageKey, 60 * 60);
          if (error) throw error;
          return data.signedUrl;
        });
        const response = await runForActiveOwner(userId, getActiveUserId, () => fetch(signedUrl, {
          cache: "no-store",
          referrerPolicy: "no-referrer",
        }));
        if (!response.ok) throw new Error("Photo download failed.");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("Stored photo could not be read.");
        await runForActiveOwner(userId, getActiveUserId, () => saveLocalProgressPhotoBlob(userId, photo.id, blob).catch(() => undefined));
        if (!cancelled) setImageUrl(URL.createObjectURL(blob));
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    void openPhoto();
    return () => { cancelled = true; };
  }, [userId, photo.id, photo.storageKey, photo.updatedAt, online, offlineMode, canAccessAccountPhotos, downloadAttempt, getActiveUserId]);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const loading = !imageUrl && !loadError && !cacheChecked;

  return (
    <article className="progress-photo-card">
      <div className="progress-photo-image-wrap">
        {imageUrl ? <img src={imageUrl} alt={`Progress photo from ${formatDate(photo.date)}`} loading="lazy" /> : (
          <div className="progress-photo-placeholder">
            {loading ? <LoaderCircle className="spin" size={22} /> : offlineMode || !online ? <WifiOff size={21} /> : <ImageIcon size={22} />}
            <span>{loading ? "Opening photo…" : loadError ? "Could not load photo" : offlineMode || !online ? "Not cached on this device" : "Photo unavailable"}</span>
            {loadError && online && !offlineMode && canAccessAccountPhotos && <button className="text-action" type="button" onClick={() => { setLoadError(false); setCacheChecked(false); setDownloadAttempt(current => current + 1); }}>Try again</button>}
          </div>
        )}
        {imageUrl && <a className="photo-download-button" href={imageUrl} download={photo.fileName || `repbook-${photo.date}.jpg`} aria-label="Download progress photo"><Download size={15} /></a>}
      </div>
      <div className="progress-photo-meta">
        <div><strong>{formatDate(photo.date, { month: "short", day: "numeric", year: "numeric" })}</strong>{photo.note && <p>{photo.note}</p>}</div>
        <button className="icon-button small-icon" type="button" onClick={() => {
          if (window.confirm("Remove this photo and its private account file? If you are offline, the deletion will sync when you reconnect.")) {
            void deleteLocalProgressPhotoBlob(userId, photo.id).catch(() => undefined);
            void onRemove(photo);
          }
        }} aria-label={`Remove photo from ${formatDate(photo.date)} from the timeline`}><Trash2 size={14} /></button>
      </div>
    </article>
  );
}

export default function ProgressPhotosPanel({ userId, getActiveUserId, photos, offlineMode, canAccessAccountPhotos, onSave, onRemove }: Props) {
  const [date, setDate] = useState(todayAsLocalDate());
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator !== "undefined" && navigator.onLine);
  const [visibleCount, setVisibleCount] = useState(12);
  const fileInput = useRef<HTMLInputElement>(null);
  const sortedPhotos = [...photos].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!online || offlineMode || !canAccessAccountPhotos) {
      toast.error("Sign in and connect to add a photo. Photos already opened on this device can still be viewed offline.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const expectedUserId = userId;
      const prepared = await runForActiveOwner(expectedUserId, getActiveUserId, () => prepareProgressPhoto(file));
      const photoId = crypto.randomUUID();
      const storageKey = `users/${expectedUserId}/${photoId}.jpg`;
      await runForActiveOwner(expectedUserId, getActiveUserId, async () => {
        const { error } = await getSupabaseClient().storage.from(PROGRESS_PHOTO_BUCKET).upload(storageKey, prepared.blob, {
          cacheControl: "3600",
          contentType: "image/jpeg",
          upsert: false,
        });
        if (error) throw error;
      });

      const now = new Date().toISOString();
      const photo: ProgressPhoto = {
        id: photoId,
        date,
        note: note.trim(),
        storageKey,
        contentType: "image/jpeg",
        fileName: prepared.fileName,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await runForActiveOwner(expectedUserId, getActiveUserId, () => onSave(photo, prepared.blob, expectedUserId));
      setNote("");
      setDate(todayAsLocalDate());
      setVisibleCount(current => Math.max(current, photos.length + 1));
      toast.success("Progress photo saved", { description: "The image is stored in your private account bucket and cached on this device for offline viewing." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload this photo.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <section className="paper-panel progress-photos-panel">
      <header className="panel-heading">
        <div><div className="eyebrow">PROGRESS PHOTOS</div><h2>Keep the visual record.</h2></div>
        <Camera size={18} className="heading-icon" />
      </header>
      <p className="photo-panel-intro">Add a date and note, then choose a photo. Images are resized and recompressed on this device before upload.</p>
      <div className="photo-upload-form">
        <label className="field-block"><span>Date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} required /></label>
        <label className="field-block photo-note-field"><span>Note <small>optional</small></span><input value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder="Front, side, training block…" /></label>
        <input ref={fileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void upload(event.target.files?.[0])} />
        <button className="button button-primary photo-upload-button" type="button" onClick={() => fileInput.current?.click()} disabled={uploading || !online || offlineMode || !canAccessAccountPhotos}>
          {uploading ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
          {uploading ? "Uploading…" : "Add photo"}
        </button>
      </div>
      <p className="photo-storage-note">Uploads need a connection and sign-in. Photos opened on this browser are cached for offline viewing. Removing a photo deletes its private file when the change syncs.</p>

      {sortedPhotos.length ? (
        <>
          <div className="progress-photo-grid">
            {sortedPhotos.slice(0, visibleCount).map(photo => (
              <ProgressPhotoCard
                key={photo.id}
                photo={photo}
                userId={userId}
                getActiveUserId={getActiveUserId}
                offlineMode={offlineMode}
                online={online}
                canAccessAccountPhotos={canAccessAccountPhotos}
                onRemove={onRemove}
              />
            ))}
          </div>
          {visibleCount < sortedPhotos.length && <button className="text-action photo-show-more" type="button" onClick={() => setVisibleCount(current => current + 12)}>Show older photos <span>({sortedPhotos.length - visibleCount} remaining)</span></button>}
        </>
      ) : (
        <div className="photo-empty"><span><Camera size={20} /></span><strong>No progress photos yet</strong><p>Your dated photo history will appear here.</p></div>
      )}
    </section>
  );
}
