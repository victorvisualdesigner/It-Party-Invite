import type { Metadata } from "next";
import { PageTop } from "@/components/admin/PageTop";
import { requireAdmin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { groupAccountNumber } from "@/lib/event";
import { listAccounts } from "@/lib/settings";
import { AddAccountForm, MakeActiveButton } from "./AccountControls";

export const metadata: Metadata = { title: t("admin.account.title") };

export default async function AccountPage() {
  await requireAdmin();
  const accounts = await listAccounts();
  return (
    <>
      <PageTop title={t("admin.account.title")} subtitle={t("admin.account.subtitle")} />
      <p className="quiet" style={{ margin: "-12px 0 20px" }}>
        {t("admin.account.body")} {t("admin.account.switch_note")}
      </p>
      {accounts.length ? (
        <div className="accounts">
          {accounts.map((a) => (
            <article key={a.id} className={a.active ? "bank" : "bank inactive"} aria-label={`${a.bank_name} ${a.account_number}`}>
              <div className="bank-top">
                <b>{a.bank_name}</b>
                {a.active ? <span className="chip chip-paid">{t("admin.account.active")}</span> : null}
              </div>
              <div className="acct">{groupAccountNumber(a.account_number)}</div>
              <div className="name">{a.account_name}</div>
              {a.active ? null : <MakeActiveButton accountId={a.id} />}
            </article>
          ))}
        </div>
      ) : (
        <section className="card empty-state">
          <p>{t("admin.account.empty")}</p>
        </section>
      )}
      <section className="card fieldset" style={{ marginTop: 22, maxWidth: 640 }} aria-labelledby="add-account">
        <h2 id="add-account">{t("admin.account.add")}</h2>
        <AddAccountForm />
      </section>
    </>
  );
}
