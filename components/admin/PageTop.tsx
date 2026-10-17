import type { ReactNode } from "react";

export function PageTop({ title, subtitle, tools }: { title: string; subtitle?: string; tools?: ReactNode }) {
  return (
    <header className="top">
      <div>
        <h1 className="display">{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {tools ? <div className="tools">{tools}</div> : null}
    </header>
  );
}
