import { useTheme, type Theme } from "../context/ThemeContext";

interface LogoProps {
  /** "full" = isotipo + nombre. "isotype" = solo el símbolo. */
  type?: "full" | "isotype";
  /**
   * Superficie sobre la que se dibuja el logo. Si se omite, se usa el tema
   * actual del sitio (claro/oscuro). Útil para zonas con fondo fijo, como el
   * sidebar (siempre oscuro) sin importar el tema elegido por el usuario.
   */
  surface?: Theme;
  className?: string;
}

/** Logotipo/isotipo de MicroHelpDesk, con la variante correcta según la superficie. */
export default function Logo({ type = "full", surface, className }: LogoProps) {
  const { theme } = useTheme();
  const effective = surface ?? theme;
  const file = type === "full" ? (effective === "dark" ? "logo-oscuro" : "logo-claro") : effective === "dark" ? "isotipo-oscuro" : "isotipo-claro";
  return <img src={`/brand/${file}.png`} alt="MicroHelpDesk" className={className} />;
}
