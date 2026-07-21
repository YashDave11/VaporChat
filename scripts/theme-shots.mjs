// Screenshot both themes across Vapor's screens.
import { chromium } from "playwright"
import fs from "node:fs"

const OUT = "scripts/shots"
fs.mkdirSync(OUT, { recursive: true })

const BASE = "http://localhost:5173"

async function shoot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log("shot", name)
}

async function run(theme) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme, // system preference — no override stored
    reducedMotion: "reduce", // stable screenshots
  })
  const page = await ctx.newPage()

  // landing
  await page.goto(BASE)
  await page.waitForTimeout(1800)
  await shoot(page, `${theme}-landing-hero`)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.28))
  await page.waitForTimeout(800)
  await shoot(page, `${theme}-landing-modes`)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55))
  await page.waitForTimeout(800)
  await shoot(page, `${theme}-landing-privacy`)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(800)
  await shoot(page, `${theme}-landing-cta`)

  // gate
  await page.goto(`${BASE}/#/chat`)
  await page.waitForTimeout(1200)
  await shoot(page, `${theme}-gate`)

  // gate: create panel open + error state
  await page.getByRole("button", { name: /Create a Room/i }).click()
  await page.waitForTimeout(400)
  await page.getByRole("button", { name: /Open the room/i }).click()
  await page.waitForTimeout(400)
  await shoot(page, `${theme}-gate-create-error`)

  // room browser
  await page.getByRole("button", { name: /Join an Open Room/i }).click()
  await page.waitForTimeout(900)
  await shoot(page, `${theme}-browser`)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)

  // matching (needs a name)
  await page.getByLabel(/display name/i).fill("wren")
  await page.getByRole("button", { name: /Find Stranger/i }).click()
  await page.waitForTimeout(1000)
  await shoot(page, `${theme}-matching`)
  const nevermind = page.getByRole("button", { name: /never mind/i })
  if (await nevermind.isVisible().catch(() => false)) await nevermind.click()
  await page.waitForTimeout(400)

  // room: create a public room for real
  await page.getByRole("button", { name: /Create a Room/i }).click()
  await page.waitForTimeout(300)
  await page.getByLabel(/room name/i).fill("3am static")
  await page.getByRole("button", { name: /Open the room/i }).click()
  await page.waitForTimeout(1200)
  await shoot(page, `${theme}-room`)

  // composer with text + vaporize confirm
  await page.getByRole("textbox", { name: "Message" }).fill("say it once, then it's gone")
  await page.waitForTimeout(300)
  await shoot(page, `${theme}-room-composing`)
  await page.getByRole("button", { name: /vaporize/i }).click()
  await page.waitForTimeout(600)
  await shoot(page, `${theme}-room-confirm`)
  await page.getByRole("button", { name: /vaporize me|vaporize it/i }).click()
  await page.waitForTimeout(1200)
  await shoot(page, `${theme}-ended`)

  // toggle check: flip theme manually on the landing page
  await page.goto(BASE)
  await page.waitForTimeout(800)
  await page.getByRole("switch", { name: /theme|night|day/i }).click()
  await page.waitForTimeout(900)
  await shoot(page, `${theme}-after-manual-toggle`)

  await browser.close()
}

for (const theme of ["dark", "light"]) await run(theme)
console.log("done")
