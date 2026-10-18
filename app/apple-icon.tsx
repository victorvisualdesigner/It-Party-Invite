// The home screen icon for anyone who adds the site to their phone: the seal on bottle green.
import { ImageResponse } from "next/og";
import { appIconSvg } from "@/lib/brand-svg";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(appIconSvg(180)).toString("base64")}`;
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <img src={src} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
