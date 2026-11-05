// Windows API 常量定义
import koffi from 'koffi'

// ====== 常量 ======
// 窗口样式
export const WS_POPUP = 0x80000000
export const WS_VISIBLE = 0x10000000

// 扩展窗口样式
export const WS_EX_LAYERED = 0x00080000
export const WS_EX_TOPMOST = 0x00000008
export const WS_EX_TOOLWINDOW = 0x00000080
export const WS_EX_TRANSPARENT = 0x00000020

// 窗口消息
export const WM_DESTROY = 0x0002
export const WM_CLOSE = 0x0010
export const WM_LBUTTONDOWN = 0x0201
export const WM_LBUTTONUP = 0x0202
export const WM_RBUTTONDOWN = 0x0204
export const WM_RBUTTONUP = 0x0205
export const WM_MOUSEMOVE = 0x0200
export const WM_MOUSEWHEEL = 0x020A
export const WM_NCHITTEST = 0x0084

// NCHITTEST 返回值
export const HTCAPTION = 2
export const HTCLIENT = 1

// ShowWindow 命令
export const SW_SHOW = 5
export const SW_HIDE = 0

// UpdateLayeredWindow 标志
export const ULW_ALPHA = 0x00000002

// AlphaFormat
export const AC_SRC_OVER = 0x00
export const AC_SRC_ALPHA = 0x01

// GDI+ 常量
export const UnitPixel = 2

// 窗口类样式
export const CS_HREDRAW = 0x0002
export const CS_VREDRAW = 0x0001

// 颜色
export const COLOR_WINDOW = 5

// GetDC 标志
export const CW_USEDEFAULT = 0x80000000

// 虚拟键码
export const VK_ESCAPE = 0x1B
