"use client";

// The door: scan a card with the phone camera, type the code, or search by name. "Download the list
// for offline use" keeps paid guests in IndexedDB so the door keeps working in airplane mode; check ins
// made offline queue on the phone and sync when the connection returns.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { MiniSeal } from "@/components/Seal";
import { useToast } from "@/components/Toast";
import type { DoorGuest } from "@/lib/admin-data";
import { callAction } from "@/lib/client-action";
import { t } from "@/lib/copy";
import type { DoorResult } from "@/lib/door";
import { fmtTime } from "@/lib/time";
import { checkInAction, checkInByIdAction, doorListAction } from "./actions";

/* ---------- A tiny IndexedDB key value store ---------- */
type Queued = { code: string; at: string };
function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("door", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", mode);
      const req = run(tx.objectStore("kv"));
      tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      tx.onerror = () => reject(tx.error);
    };
  });
}
const kvGet = <T,>(key: string) => idb<T>("readonly", (s) => s.get(key));
const kvSet = (key: string, value: unknown) => idb("readwrite", (s) => void s.put(value, key));

const norm = (v: string) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
  }
}

export function DoorScreen({ initial }: { initial: DoorGuest[] }) {
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<DoorGuest[]>(initial);
  const [offline, setOffline] = useState(false);
  const [result, setResult] = useState<(DoorResult & { queued?: boolean }) | null>(null);
  const [code, setCode] = useState("");
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => setList(initial), [initial]);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/door-sw.js", { scope: "/admin/door" }).catch(() => {});
  }, []);

  /* ---------- Offline ---------- */
  const localCheckIn = useCallback(async (raw: string): Promise<DoorResult & { queued?: boolean }> => {
    const saved = (await kvGet<DoorGuest[]>("list")) ?? list;
    const g = saved.find((x) => norm(x.code) === norm(raw));
    if (!g) return { kind: "invalid" };
    if (g.checkedInAt) return { kind: "already", guest: g.guest, inviter: g.inviter, at: g.checkedInAt };
    const at = new Date().toISOString();
    const next = saved.map((x) => (x.id === g.id ? { ...x, checkedInAt: at } : x));
    await kvSet("list", next);
    const queue = (await kvGet<Queued[]>("queue")) ?? [];
    await kvSet("queue", [...queue, { code: g.code, at }]);
    setList(next);
    return { kind: "valid", guest: g.guest, inviter: g.inviter, at, queued: true };
  }, [list]);

  const sync = useCallback(async () => {
    const queue = (await kvGet<Queued[]>("queue").catch(() => undefined)) ?? [];
    if (!queue.length) return;
    let done = 0;
    const left: Queued[] = [];
    for (const item of queue) {
      const r = await callAction(() => checkInAction(item.code, item.at));
      if (r.ok) done++;
      else left.push(item);
    }
    await kvSet("queue", left);
    if (done) toast(t("admin.door.synced", { n: done }));
    router.refresh();
  }, [router, toast]);

  useEffect(() => {
    const update = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) sync();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [sync]);

  async function handle(r: DoorResult & { queued?: boolean }) {
    setResult(r);
    try {
      if (navigator.vibrate) navigator.vibrate(r.kind === "valid" ? 30 : [40, 60, 40]);
    } catch {}
  }

  async function checkCode(raw: string) {
    if (!raw.trim()) return;
    if (!navigator.onLine) return handle(await localCheckIn(raw));
    const r = await callAction(() => checkInAction(raw));
    if (r.ok) return handle(r.data);
    if ("network" in r && r.network) return handle(await localCheckIn(raw));
  }

  async function checkGuest(g: DoorGuest) {
    if (!navigator.onLine) return handle(await localCheckIn(g.code));
    const r = await callAction(() => checkInByIdAction(g.id));
    if (r.ok) return handle(r.data);
    if ("network" in r && r.network) return handle(await localCheckIn(g.code));
  }

  async function download() {
    const r = await callAction(() => doorListAction());
    const fresh = r.ok ? r.data : list;
    await kvSet("list", fresh);
    setList(fresh);
    toast(t("admin.door.downloaded", { n: fresh.length }));
  }

  /* ---------- Camera ---------- */
  function stop() {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    setScanning(false);
  }
  useEffect(() => stop, []);

  async function scan() {
    if (!navigator.mediaDevices?.getUserMedia) return toast(t("admin.door.camera_unavailable"));
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch {
      return toast(t("admin.door.camera_unavailable"));
    }
    setScanning(true);
    requestAnimationFrame(async () => {
      const v = video.current;
      if (!v || !stream.current) return;
      v.srcObject = stream.current;
      await v.play().catch(() => {});
      const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const loop = async () => {
        if (!stream.current || !v.videoWidth) {
          if (stream.current) setTimeout(loop, 200);
          return;
        }
        let value: string | null = null;
        try {
          if (detector) {
            const codes = await detector.detect(v);
            value = codes[0]?.rawValue ?? null;
          } else if (jsQR && ctx) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            value = jsQR(img.data, img.width, img.height)?.data ?? null;
          }
        } catch {}
        if (value) {
          stop();
          checkCode(value);
          return;
        }
        setTimeout(loop, 250);
      };
      loop();
    });
  }

  const inside = list.filter((g) => g.checkedInAt).length;
  const shown = list.filter((g) => !q || g.guest.toLowerCase().includes(q.toLowerCase()));
  const line =
    result == null
      ? ""
      : result.kind === "valid"
        ? t("admin.door.valid", { guest: result.guest })
        : result.kind === "already"
          ? t("admin.door.already", { time: fmtTime(result.at) })
          : result.kind === "unpaid"
            ? t("admin.door.unpaid")
            : t("admin.door.invalid");

  return (
    <div className="door">
      <section className="card scan">
        <div className="toolbar" style={{ padding: 0, border: 0, justifyContent: "space-between" }}>
          {offline ? <span className="quiet">{t("admin.door.offline")}</span> : <span />}
          <button className="btn btn-ghost btn-sm" type="button" onClick={download}>
            <Icon name="download" />
            <span>{t("admin.door.download")}</span>
          </button>
        </div>
        <div className="viewfinder">
          {scanning ? (
            <>
              <video ref={video} playsInline muted autoPlay />
              <span className="frame" />
              <button className="btn btn-ghost btn-sm" type="button" onClick={stop} style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", color: "var(--mist-100)" }}>
                {t("admin.door.camera_stop")}
              </button>
            </>
          ) : (
            <div className="idle">
              <Icon name="qr" />
              <button className="btn btn-gold" type="button" onClick={scan}>
                {t("admin.door.scan")}
              </button>
            </div>
          )}
        </div>
        <form
          className="code-row"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            checkCode(code);
          }}
        >
          <label className="sr" htmlFor="d-code">
            {t("admin.door.code_placeholder")}
          </label>
          <input className="input" id="d-code" placeholder={t("admin.door.code_placeholder")} autoComplete="off" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn btn-gold" type="submit">
            {t("admin.door.check")}
          </button>
        </form>
        <div aria-live="assertive">
          {result ? (
            <div className={`result ${result.kind}`}>
              <MiniSeal letter={result.kind === "valid" ? "✓" : result.kind === "already" ? "!" : "×"} quiet={result.kind !== "valid"} />
              <div>
                {line}
                {"guest" in result ? (
                  <small>
                    {result.guest} · {t("guest.ticket.invited_by", { inviter: result.inviter })}
                  </small>
                ) : null}
                {result.queued ? <small>{t("admin.door.queued")}</small> : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
      <section className="card">
        <div className="toolbar">
          <span className="inside">{t("admin.door.checked_in", { n: inside, total: list.length })}</span>
          <label className="search" style={{ marginLeft: "auto" }}>
            <Icon name="search" />
            <span className="sr">{t("admin.door.search")}</span>
            <input className="input" type="search" placeholder={t("admin.door.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="list-rows">
          {shown.length ? (
            shown.map((g) => (
              <div className="item" key={g.id}>
                <div className="who">
                  <MiniSeal letter={g.guest.charAt(0).toUpperCase()} />
                  <div>
                    <b>{g.guest}</b>
                    <small>
                      {t("guest.ticket.invited_by", { inviter: g.inviter })} · {g.code}
                    </small>
                  </div>
                </div>
                {g.checkedInAt ? (
                  <span className="in-tag">
                    <Icon name="check" />
                    {t("admin.door.inside")} {fmtTime(g.checkedInAt)}
                  </span>
                ) : (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => checkGuest(g)}>
                    {t("admin.door.check")}
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="empty-row">{t("admin.guests.empty")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
