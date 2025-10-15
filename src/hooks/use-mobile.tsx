import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const checkSize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    
    // Check on mount (client-side)
    checkSize();
    
    // Add event listener
    window.addEventListener("resize", checkSize)
    
    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", checkSize)
  }, [])

  return isMobile
}
