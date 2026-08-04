import type { Metadata } from 'next'
import { Gloock, Montserrat } from 'next/font/google'
import './globals.css'

const gloock = Gloock({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-gloock',
  display: 'swap',
})

const montserrat = Montserrat({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'August',
  description: 'Residential Township Projects'
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${gloock.variable} ${montserrat.variable}`}>
      <body>{children}</body>
    </html>
  )
}
