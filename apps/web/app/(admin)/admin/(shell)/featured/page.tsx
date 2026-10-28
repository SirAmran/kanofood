import type { Metadata } from "next";
import Link from "next/link";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Cluster,
  EmptyState,
  Media,
  PageHeader,
  SectionHeader,
  Spread,
  Stack,
} from "@kanofood/ui";

import { AdminDelete } from "@/app/(admin)/_components/admin-delete";
import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { AdminToggle } from "@/app/(admin)/_components/admin-toggle";
import { AdminUpload } from "@/app/(admin)/_components/admin-upload";
import { listFeaturedCards } from "@/lib/admin/featured";
import { requireAdmin } from "@/lib/admin/session";

/**
 * Home highlights. The editor for the featured rail on screen 4.1.
 *
 * The rail is the first thing a customer sees, so this is one of the few admin
 * screens whose output is seen before a single tap. It is deliberately a list of
 * cards rather than a single form: each card has its own write, so changing the
 * photograph on one cannot silently reorder or retitle another.
 *
 * **The six built-in cards are shown here as an offer, not as rows.** With an
 * empty table the storefront still opens with them; one button copies them in
 * and they become editable. That is why the page can be empty and the home
 * screen is never empty at the same time.
 */

export const metadata: Metadata = { title: "Home highlights" };

export const dynamic = "force-dynamic";

export default async function FeaturedPage() {
  await requireAdmin();
  const { cards, usingFallback } = await listFeaturedCards();

  return (
    <Stack>
      <PageHeader
        title="Home highlights"
        sub="The cards across the top of the storefront, in the order they appear."
        action={<Link href="/" target="_blank">View storefront</Link>}
      />

      <Alert tone="info">
        The storefront is not cached, so a change here is live on the next request. A card is a photograph,
        a line of copy and a link; it does not have to be a dish that is already on a menu.
      </Alert>

      {usingFallback ? (
        <Card>
          <CardHeader
            title="The storefront is showing the built-in set"
            action={<Badge tone="accent">6 cards</Badge>}
          />
          <CardBody>
            <Stack>
              <p className="kf-muted">
                Strawberry Parfait, Chinese Fried Rice, Tuwo &amp; Miyan Kuka, Suya, Jollof and Zobo are
                built in, so a fresh deployment is never an empty front door. Load them as rows to change
                their photographs, copy, order or links.
              </p>
              <AdminForm
                action="/api/v1/admin/featured/defaults"
                submitLabel="Load the six starting cards"
                successMessage="The starting cards are now rows. Edit them below."
                fields={[]}
              />
            </Stack>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="On the home rail"
          action={
            <span className="kf-muted">
              {cards.length === 0
                ? "Nothing shown"
                : `${String(cards.filter((card) => card.isActive).length)} of ${String(cards.length)} showing`}
            </span>
          }
        />

        {cards.length === 0 ? (
          <CardBody>
            <EmptyState title="No cards yet">
              Load the starting set above, or add one below. The storefront keeps showing the built-in
              set until a row exists.
            </EmptyState>
          </CardBody>
        ) : (
          cards.map((card) => (
            <CardBody key={card.id}>
              <Stack>
                <Spread>
                  <Cluster>
                    <Media
                      src={card.imageUrl}
                      alt={card.title}
                      shape="thumb"
                      fallback={<span className="kf-muted">No image</span>}
                    />
                    <span>
                      <strong>{card.title}</strong>
                      <div className="kf-muted">
                        {[card.subtitle, card.href, `order ${String(card.sortOrder)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      <Cluster>
                        {card.badge ? <Badge tone="accent">{card.badge}</Badge> : null}
                        <Badge tone={card.isActive ? "success" : "neutral"}>
                          {card.isActive ? "On the rail" : "Hidden"}
                        </Badge>
                      </Cluster>
                    </span>
                  </Cluster>

                  <AdminToggle
                    action={`/api/v1/admin/featured/${card.id}`}
                    method="PATCH"
                    name="isActive"
                    label="Show on the home rail"
                    checked={card.isActive}
                    successMessage={card.isActive ? "Card hidden." : "Card is on the rail."}
                  />
                </Spread>

                <details>
                  <summary className="kf-muted">Edit card</summary>
                  <Stack>
                    <AdminForm
                      action={`/api/v1/admin/featured/${card.id}`}
                      method="PATCH"
                      submitLabel="Save card"
                      successMessage="Card saved."
                      fields={[
                        { name: "title", label: "Title", type: "text", value: card.title, required: true },
                        {
                          name: "subtitle",
                          label: "Kitchen or line",
                          type: "text",
                          value: card.subtitle ?? "",
                          sendEmpty: true,
                          hint: "Shown under the title. A kitchen name, a category, or one short line.",
                        },
                        {
                          name: "badge",
                          label: "Badge",
                          type: "text",
                          value: card.badge ?? "",
                          sendEmpty: true,
                          placeholder: "New",
                          hint: "A short label on the photograph. Leave it empty for none.",
                        },
                        {
                          name: "href",
                          label: "Link",
                          type: "text",
                          value: card.href,
                          required: true,
                          hint: "An internal path, for example /kitchens or /kitchens/mama-aisha-kitchen.",
                        },
                        {
                          name: "imageUrl",
                          label: "Image URL",
                          type: "text",
                          value: card.imageUrl ?? "",
                          sendEmpty: true,
                          hint: "Paste an https URL, or upload below. A card without an image shows its title on a warm panel.",
                        },
                        {
                          name: "sortOrder",
                          label: "Order on the rail",
                          type: "number",
                          value: card.sortOrder,
                          hint: "Lowest first.",
                        },
                      ]}
                    />
                    <AdminUpload
                      purpose="featured-card"
                      ownerId={card.id}
                      label="Upload a photograph"
                      successMessage="Photograph updated."
                    />
                  </Stack>
                </details>

                <AdminDelete
                  action={`/api/v1/admin/featured/${card.id}`}
                  what={card.title}
                  label="Remove card"
                  warning="The card leaves the rail. The photograph is removed from storage as well."
                />
              </Stack>
            </CardBody>
          ))
        )}
      </Card>

      <Card>
        <CardHeader title="Add a card" />
        <CardBody>
          <Stack>
            <SectionHeader title="What a customer will see" />
            <AdminForm
              action="/api/v1/admin/featured"
              submitLabel="Add to the rail"
              successMessage="Card added. Upload its photograph next."
              fields={[
                { name: "title", label: "Title", type: "text", required: true, placeholder: "Strawberry Parfait" },
                {
                  name: "subtitle",
                  label: "Kitchen or line",
                  type: "text",
                  placeholder: "Chilled dessert · Drinks",
                },
                {
                  name: "badge",
                  label: "Badge",
                  type: "text",
                  placeholder: "New",
                  hint: "A short label on the photograph. Optional.",
                },
                {
                  name: "href",
                  label: "Link",
                  type: "text",
                  value: "/kitchens",
                  required: true,
                  hint: "Where the card takes the customer. An internal path only.",
                },
                {
                  name: "imageUrl",
                  label: "Image URL",
                  type: "text",
                  hint: "Optional now. You can upload a photograph after the card exists.",
                },
                { name: "sortOrder", label: "Order on the rail", type: "number", value: 100 },
                { name: "isActive", label: "Show on the home rail", type: "switch", value: true },
              ]}
            />
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}
