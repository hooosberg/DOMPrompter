import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { installElectronApiMock } from './electron-api.mock'

describe('settings and localization', () => {
  beforeEach(() => {
    installElectronApiMock()
  })

  it('changes app language from settings and notifies the main menu bridge', async () => {
    const api = installElectronApiMock()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /settings|设置/i }))
    fireEvent.click(await screen.findByRole('button', { name: /language/i }))
    fireEvent.click(await screen.findByRole('button', { name: /简体中文/i }))

    await waitFor(() => {
      expect(api.menu.changeLanguage).toHaveBeenCalledWith('zh')
      expect(api.settings.set).toHaveBeenCalledWith('language', 'zh')
      expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument()
    })
  })

  it('opens settings when the shortcut event is emitted', async () => {
    const api = installElectronApiMock()
    render(<App />)

    act(() => {
      api.__emitShortcut('openSettings')
    })

    expect(await screen.findByRole('heading', { name: /settings|设置/i })).toBeInTheDocument()
  })

  it('limits appearance settings to light and dark themes', async () => {
    const api = installElectronApiMock()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /settings|设置/i }))
    fireEvent.click(await screen.findByRole('button', { name: /light|浅色/i }))

    await waitFor(() => {
      expect(api.settings.set).toHaveBeenCalledWith('theme', 'light')
    })

    expect(screen.getByRole('button', { name: /dark|深色/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^language$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /language/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^english$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/accent color|强调色/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/glass opacity|毛玻璃透明度/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/auto|跟随系统/i)).not.toBeInTheDocument()
  })

  it('upgrades the current session to pro from the license tab', async () => {
    const api = installElectronApiMock()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /settings|设置/i }))
    fireEvent.click(await screen.findByRole('button', { name: /license|许可证/i }))
    fireEvent.click(await screen.findByRole('button', { name: /upgrade to pro|升级到 pro/i }))

    await waitFor(() => {
      expect(api.license.purchase).toHaveBeenCalled()
      expect(screen.getByText(/^Pro$/i)).toBeInTheDocument()
    })

    expect(
      screen.getByText(/thank you for supporting domprompter|感谢支持 domprompter/i),
    ).toBeInTheDocument()
  })
})
