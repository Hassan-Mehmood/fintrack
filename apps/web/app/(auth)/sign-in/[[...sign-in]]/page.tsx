import { SignIn } from "@clerk/nextjs";
import { PiggyBankIcon } from "lucide-react";

export default function SignInPage() {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
      <section className="flex min-h-[320px] items-center border-b bg-primary p-6 text-primary-foreground md:pl-10 lg:min-h-dvh lg:border-b-0 lg:border-r lg:py-10 lg:pl-20 lg:pr-10 xl:pl-28">
        <div className="w-full max-w-xl space-y-10">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-foreground text-primary">
              <PiggyBankIcon className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">FinTrack</p>
              <p className="text-xs text-primary-foreground/75">
                Personal finance dashboard
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-medium text-primary-foreground/75">
              One place for every balance
            </p>
            <h1 className="text-3xl font-semibold tracking-normal md:text-4xl">
              Understand your cash, investments, spending, and savings goals.
            </h1>
            <p className="max-w-lg text-sm leading-6 text-primary-foreground/80 md:text-base">
              Sign in to keep account balances, transactions, budgets, goals,
              and investment records tied to your private workspace.
            </p>
          </div>
        </div>
      </section>

      <section className="flex min-h-[calc(100dvh-320px)] items-center justify-center p-6 lg:min-h-dvh lg:p-10">
        <SignIn
          path="/sign-in"
          routing="path"
          signUpUrl="/sign-up"
          appearance={{
            elements: {
              rootBox: "w-full max-w-md",
              cardBox: "shadow-none border border-border rounded-lg",
            },
          }}
        />
      </section>
    </main>
  );
}
