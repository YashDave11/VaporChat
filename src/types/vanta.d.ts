declare module "vanta/dist/vanta.net.min" {
  interface VantaEffect {
    destroy(): void
  }
  const NET: (options: Record<string, unknown>) => VantaEffect
  export default NET
}
