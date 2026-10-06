import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { installElectronApiMock } from './electron-api.mock'

describe('builtin onboarding shell', () => {
  beforeEach(() => {
    installElectronApiMock()
  })

  it('renders an always-visible address bar on first paint', () => {
    render(<App />)

    expect(screen.getByRole('textbox', { name: /page address|页面地址/i })).toBeInTheDocument()
  })

  it('shows onboarding choices for server mode and html mode', () => {
    render(<App />)

    expect(screen.getByText(/server mode/i)).toBeInTheDocument()
    expect(screen.getByText(/html mode/i)).toBeInTheDocument()
  })

  it('loads the current address bar URL when pressing Enter', async () => {
    const api = installElectronApiMock()
    render(<App />)

    const input = screen.getByRole('textbox', { name: /page address|页面地址/i })
    fireEvent.change(input, { target: { value: 'localhost:4173' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(api.loadUrl).toHaveBeenCalledWith('http://localhost:4173')
      expect(api.attachDebugger).toHaveBeenCalled()
      expect(api.overlay.sync).toHaveBeenCalled()
    }, { timeout: 2500 })
  })

  it('allows pasting an external url into the address bar', () => {
    render(<App />)

    const input = screen.getByRole('textbox', { name: /page address|页面地址/i })
    fireEvent.paste(input, {
      clipboardData: {
        getData: (type: string) => (type === 'text' ? 'https://example.com/landing' : ''),
      },
    })

    expect(input).toHaveValue('https://example.com/landing')
  })

  it('opens a dedicated html onboarding flow before invoking the file picker', async () => {
    const api = installElectronApiMock()
    render(<App />)

    fireEvent.click(screen.getByText(/html mode/i))

    expect(await screen.findByRole('heading', { name: /html mode/i })).toBeInTheDocument()
    expect(api.selectHtmlFile).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /open html file/i }))

    await waitFor(() => {
      expect(api.selectHtmlFile).toHaveBeenCalled()
    })
  })

  it('shows the animated server card flow with arrow navigation', async () => {
    render(<App />)

    fireEvent.click(screen.getByText(/server mode/i))

    expect(await screen.findByRole('heading', { name: /server mode/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^exit$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy prompt/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copy command/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))

    expect(await screen.findByRole('button', { name: /copy command/i })).toBeInTheDocument()
  })

  it('opens the settings modal from the toolbar', async () => {
    installElectronApiMock()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /settings|设置/i }))

    expect(await screen.findByRole('heading', { name: /settings|设置/i })).toBeInTheDocument()
  })
})
