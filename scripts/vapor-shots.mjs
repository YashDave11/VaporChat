import { chromium } from "playwright"

const shots = process.argv[2] || "shots"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

// Gate (selection screen)
await page.goto("http://localhost:5199/#/chat")
await page.waitForTimeout(2500)
await page.screenshot({ path: `${shots}/gate.png` })

// Matching screen — enter a name, pick Find Stranger
await page.fill("input[type=text]", "nova")
await page.click("text=Find Stranger")
await page.waitForTimeout(2000)
await page.screenshot({ path: `${shots}/matching.png` })
await page.click("text=never mind")
await page.waitForTimeout(800)

// Room browser
await page.click("text=Join an Open Room")
await page.waitForTimeout(1500)
await page.screenshot({ path: `${shots}/browser.png` })
await page.keyboard.press("Escape")
await page.waitForTimeout(800)

// A room: create a public room to get the chat screen
await page.click("text=Create a Room")
await page.waitForTimeout(600)
await page.fill("#\\:r6\\: , input[placeholder=\"what's it about?\"]", "night frequencies").catch(() => {})
await page.fill('input[placeholder="what\'s it about?"]', "night frequencies")
await page.click("text=Open the room")
await page.waitForTimeout(2000)
await page.screenshot({ path: `${shots}/room.png` })

await browser.close()
console.log("done")
