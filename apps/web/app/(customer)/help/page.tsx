import type { Metadata } from "next";
import Link from "next/link";

import { Alert, buttonClass } from "@kanofood/ui";

import { platformPhone, platformWhatsApp } from "@/lib/env";

/**
 * Screen 4.13, help and contact.
 *
 * Static, and deliberately so: UX_SPEC says this screen has no loading state,
 * because a customer who needs help should not be waiting on a query to find a
 * phone number. Everything here is local content plus the two configured
 * contact channels.
 *
 * At launch confirmation is a phone call, so the number is the page. When it is
 * not configured the page says that plainly rather than rendering a dead button,
 * and points to the kitchen's number on the order page, which always exists.
 */

export const metadata: Metadata = { title: "Help and contact" };

/**
 * `wa.me` needs an international number, and the configured one may be typed in
 * the local Nigerian form. A leading zero on an 11-digit number is turned into
 * `234`; anything else is passed through as digits. This affects only the link,
 * never a stored phone number.
 */
function whatsappHref(value: string): string {
  const digits = value.replace(/\D/g, "");
  const international = digits.startsWith("0") && digits.length === 11 ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
}

const FAQ: readonly { readonly question: string; readonly answer: string }[] = [
  {
    question: "How do I place an order?",
    answer:
      "Choose a kitchen, add the dishes you want to the cart, then check out with your name, phone number and delivery address. The kitchen calls you to confirm before cooking, so keep your phone nearby.",
  },
  {
    question: "How do I pay?",
    answer:
      "Most orders are cash on delivery: hand the total shown on your order to the rider. Some areas require a bank transfer before delivery, and checkout will say so before you place the order. Card payment is not available yet.",
  },
  {
    question: "How do I cancel an order?",
    answer:
      "Open your order and choose Request cancellation. You can cancel there until a rider has been assigned. After that, call us and we will handle it for you.",
  },
  {
    question: "How much is delivery?",
    answer:
      "The fee depends on the distance between the kitchen and the pin you choose for delivery. The exact fee is shown on the kitchen, in the cart and at checkout before you confirm. We never charge a fee we could not work out.",
  },
  {
    question: "Where do you deliver?",
    answer:
      "We deliver across Kano Metropolitan within the active delivery zones. If your address is outside every zone, the location screen tells you and gives you our number, so you can ask about your area.",
  },
  {
    question: "I cannot find my order.",
    answer:
      "Open the tracking link from your confirmation. If this browser does not have it saved, enter the phone number the order was placed with. If that still does not work, call us.",
  },
];

export default function HelpPage() {
  const phone = platformPhone();
  const whatsapp = platformWhatsApp();

  return (
    <section className="sf-page sf-help">
      <div className="sf-hero">
        <h1 className="sf-hero__title">Help and contact</h1>
        <p className="sf-tile__meta">
          The quickest way to reach a person is a phone call. Most delivery problems are settled in
          one call.
        </p>
      </div>

      <section className="sf-form__section">
        <h2 className="sf-form__heading">Call us</h2>

        {phone ? (
          <a href={`tel:${phone}`} className={buttonClass({ variant: "primary", size: "lg", block: true })}>
            Call {phone}
          </a>
        ) : (
          <Alert tone="warning" title="Phone support is not published yet">
            Our support number is not set up on this site. If you already have an order, the
            kitchen&apos;s number is on your order page and the kitchen can reach us.
          </Alert>
        )}

        {whatsapp ? (
          <a
            href={whatsappHref(whatsapp)}
            className={buttonClass({ variant: "secondary", block: true })}
            rel="noreferrer noopener"
          >
            Message us on WhatsApp
          </a>
        ) : null}

        <p className="sf-field__hint">
          Have your order number ready if you have one. It is on your confirmation and at the top
          of the tracking page.
        </p>
      </section>

      <section className="sf-form__section">
        <h2 className="sf-form__heading">Common questions</h2>
        {FAQ.map((entry) => (
          <details key={entry.question} className="sf-faq">
            <summary className="sf-faq__question">{entry.question}</summary>
            <p className="sf-faq__answer">{entry.answer}</p>
          </details>
        ))}
      </section>

      <section className="sf-form__section">
        <h2 className="sf-form__heading">Cancellation policy</h2>
        <p className="sf-faq__answer">
          You can cancel from your order page until a rider has been assigned, and cancelling is
          free: nothing is charged for an order that was cancelled. Once a rider is on the way the
          order can no longer be cancelled from the site, because the food and the trip are already
          paid for by someone. Call us and we will look at it with you.
        </p>
        <p className="sf-faq__answer">
          If you paid by bank transfer, call us after cancelling and we will arrange the refund.
        </p>
      </section>

      <section className="sf-form__section">
        <h2 className="sf-form__heading">Delivery zones and fees</h2>
        <p className="sf-faq__answer">
          Kano Metropolitan is divided into delivery zones. Your fee is worked out from the
          straight distance between the kitchen and the point you choose for delivery, using that
          zone&apos;s distance bands. Two kitchens down different streets from you can therefore
          quote differently for the same address.
        </p>
        <p className="sf-faq__answer">
          You see the fee before you confirm, and the order is priced again when it is placed. If
          your point is outside every active zone, the location screen says so before checkout and
          gives you our number. Some zones require payment before delivery, and the checkout will
          only offer you the methods that zone accepts.
        </p>
      </section>

      <div className="sf-form__body">
        <Link href="/" className={buttonClass({ variant: "ghost", block: true })}>
          Back to home
        </Link>
      </div>
    </section>
  );
}
