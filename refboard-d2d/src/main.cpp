#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <windowsx.h>
#include <mmsystem.h>
#include <propvarutil.h>
#pragma comment(lib, "winmm.lib")
#include <d2d1.h>
#include <d2d1_1.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <wincodec.h>
#include <wincodecsdk.h>
#include <wrl/client.h>
#include <shellapi.h>
#include <cstdio>
#include <share.h>
#include <algorithm>
#include <vector>
#include <cmath>
#include <string>
#include <cstdint>
#include <dwrite.h>
#include <fstream>
#include <sstream>
using Microsoft::WRL::ComPtr;
#pragma comment(lib, "shell32.lib")
#pragma comment(linker, "/SUBSYSTEM:WINDOWS /ENTRY:mainCRTStartup")
FILE* g_log = nullptr;
void dbg(const wchar_t* fmt, ...) {
    if (!g_log) return;
    SYSTEMTIME st; GetLocalTime(&st);
    fwprintf(g_log, L"[%02d:%02d:%02d.%03d] ", st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);
    va_list args; va_start(args, fmt);
    vfwprintf(g_log, fmt, args); va_end(args);
    fwprintf(g_log, L"\n"); fflush(g_log);
}
constexpr double INITIAL_WINDOW_FACTOR  = 0.54;
constexpr double ZOOM_FACTOR_UP         = 1.08;
constexpr double ZOOM_FACTOR_DOWN       = (1.0 / 1.08);
constexpr int    MIN_WINDOW_WIDTH       = 150;
constexpr double MAX_DECODE_MP          = 2.0;
constexpr float  SLIDER_BAR_W = 100.f, SLIDER_BAR_H = 18.f, SLIDER_MARGIN = 5.f;
constexpr float  SLIDER_TRACK_H = 4.f, SLIDER_THUMB_R = 5.f;
constexpr float  OPACITY_MIN = 0.15f, OPACITY_MAX = 1.0f, OPACITY_STEP = 0.05f;
constexpr float  BUTTON_GRID = 26.f, CLOSE_STROKE_W = 1.5f;
constexpr D2D1_COLOR_F BTN_BG = {0,0,0,0.55f}, BTN_BG_ACTIVE = {0,0,0,0.7f};
constexpr D2D1_COLOR_F SLIDER_BG = {0,0,0,0.45f};
constexpr D2D1_COLOR_F TRACK_FILLED = {1,1,1,0.8f}, TRACK_UNFILLED = {1,1,1,0.35f};
constexpr D2D1_COLOR_F ICON_COLOR_ON = {1,1,1,1}, ICON_COLOR_OFF = {1,1,1,0.35f};
constexpr D2D1_COLOR_F CLOSE_COLOR = {0.93f,0.93f,0.93f,1}, THUMB_COLOR = {1,1,1,1};
constexpr UINT IDM_FLIP_H = 1001, IDM_FLIP_V = 1002, IDM_RESET = 1003;
constexpr UINT IDM_DUPLICATE = 1004, IDM_CLOSE = 1005;
constexpr float GIF_BTN = 20.f, GIF_GAP = 4.f, GIF_BAR_PAD_X = 6.f, GIF_BAR_H = 20.f;
constexpr float GIF_TRACK_H = 4.f, GIF_TRACK_HIT_PAD = 6.f, GIF_COUNTER_W = 48.f;
constexpr UINT GIF_TIMER_ID = 3;
constexpr UINT GIF_TICK_MS = 8;
struct RefWindow {
    HWND hwnd = nullptr;
    ComPtr<ID2D1DCRenderTarget> rt;
    ComPtr<ID2D1Bitmap> imageBmp;
    ComPtr<IWICBitmap> wicBmpCache;
    int wicBmpCacheW = 0;
    HDC memDC = nullptr; HBITMAP dib = nullptr, oldBmp = nullptr; BYTE* dibBits = nullptr;
    std::wstring imagePath;
    int iw = 1, ih = 1; double aspect = 1; int initW = 800;
    int windowW = 0, windowH = 0;
    bool pinned = true, locked = false;
    float contentScale = 1.0f, panX = 0, panY = 0;
    bool ctrlDragging = false; int dragStartX = 0, dragStartY = 0;
    float panStartX = 0, panStartY = 0;
    float opacity = 1.0f; int decodeW = 0;
    bool draggingSlider = false, dirty = true, skipClamp = false;
    bool inSizeMove = false; int sizeMoveLeft = 0, sizeMoveTop = 0;
    double pendingZoom = 1.0; bool zoomScheduled = false;
    bool flipH = false, flipV = false; float rotation = 0.0f;
    bool isGif = false;
    std::vector<std::wstring> gifFrames;
    std::vector<ComPtr<IWICBitmap>> gifSrcFrames;  // 原生 GIF：内存中已合成的完整帧（--image 直接打开 GIF 时用）
    std::vector<int> gifDelays;
    int gifIdx = 0;
    bool gifPlaying = true;
    bool gifDraggingTrack = false;
    bool gifWasPlayingBeforeDrag = false;
    std::vector<ComPtr<ID2D1Bitmap>> gifBmpCache;
    std::vector<int> gifBmpCacheW;
    int gifCacheW = 0;
    DWORD gifAccumMs = 0;
    DWORD gifLastTick = 0;
};
struct GifGeom {
    float barLeft = 0, barTop = 0, barW = 0;
    float btn[5] = {};
    float trackL = 0, trackT = 0, trackR = 0, trackB = 0, trackW = 0;
    float counterL = 0, counterTop = 0, counterW = 0;
    bool valid = false;
};
ComPtr<ID2D1Factory1> g_d2dFactory;
ComPtr<IWICImagingFactory> g_wic;
ComPtr<IDWriteFactory> g_dwrite;
ComPtr<IDWriteTextFormat> g_gifTextFmt;
std::vector<RefWindow*> g_windows;
std::string g_locale = "zh";
int localeIdx() {
    // 西/葡语变体（es-ES/es-419/pt-PT/pt-BR）与旧笼统码（es/pt）映射到同一列：菜单文案为通用西/葡语
    if (g_locale == "es" || g_locale == "es-ES" || g_locale == "es-419") return 6;
    if (g_locale == "pt" || g_locale == "pt-PT" || g_locale == "pt-BR") return 7;
    static const char* codes[16] = { "zh", "zh-Hant", "en", "ja", "ko", "ru", "es", "pt", "de", "fr", "pl", "tr", "th", "uk", "it", "cs" };
    for (int i = 0; i < 16; i++) if (g_locale == codes[i]) return i;
    return 0;
}
const wchar_t* g_menuLabels[5][16] = {
    { L"水平翻转", L"水平翻轉", L"Flip Horizontal", L"水平反転", L"가로 뒤집기", L"Отразить по горизонтали", L"Voltear horizontalmente", L"Inverter horizontalmente", L"Horizontal spiegeln", L"Retourner horizontalement", L"Odbij w poziomie", L"Yatay çevir", L"พลิกแนวนอน", L"Відобразити горизонтально", L"Capovolgi orizzontalmente", L"Převrátit vodorovně" },
    { L"垂直翻转", L"垂直翻轉", L"Flip Vertical", L"垂直反転", L"세로 뒤집기", L"Отразить по вертикали", L"Voltear verticalmente", L"Inverter verticalmente", L"Vertikal spiegeln", L"Retourner verticalement", L"Odbij w pionie", L"Dikey çevir", L"พลิกแนวตั้ง", L"Відобразити вертикально", L"Capovolgi verticalmente", L"Převrátit svisle" },
    { L"重置缩放", L"重置縮放", L"Reset Zoom", L"リセット", L"확대·축소 초기화", L"Сбросить масштаб", L"Restablecer zoom", L"Redefinir zoom", L"Zoom zurücksetzen", L"Réinitialiser le zoom", L"Resetuj zoom", L"Yakınlaştırmayı sıfırla", L"รีเซ็ตการซูม", L"Скинути масштаб", L"Reimposta zoom", L"Obnovit zoom" },
    { L"复制窗口", L"複製視窗", L"Duplicate", L"複製", L"창 복제", L"Дублировать", L"Duplicar", L"Duplicar", L"Duplizieren", L"Dupliquer", L"Duplikuj", L"Çoğalt", L"ทำสำเนา", L"Дублювати", L"Duplica", L"Duplikovat" },
    { L"关闭窗口", L"關閉視窗", L"Close", L"閉じる", L"창 닫기", L"Закрыть", L"Cerrar", L"Fechar", L"Schließen", L"Fermer", L"Zamknij", L"Kapat", L"ปิด", L"Закрити", L"Chiudi", L"Zavřít" },
};
bool g_running = true; int g_windowOffset = 0;
int g_startX = -1, g_startY = -1;
constexpr UINT ZOOM_TIMER_ID = 1, LOCK_TRACK_TIMER_ID = 2, ZOOM_COOLDOWN_MS = 10, LOCK_TRACK_MS = 50;
LRESULT CALLBACK WndProc(HWND, UINT, WPARAM, LPARAM);
bool CreateDibAndRt(RefWindow*); void DestroyDibAndRt(RefWindow*);
void LoadImage(RefWindow*, int); void RenderFrame(RefWindow*, bool = false, int = 0, int = 0);
void DrawLockIcon(ID2D1DCRenderTarget*, ID2D1SolidColorBrush*, float, float);
void DrawSlider(RefWindow*, ID2D1DCRenderTarget*, float, float);
float SliderFromX(RefWindow*, float, float);
bool HitPin(POINT), HitLock(POINT), HitClose(RefWindow*, POINT), HitMinimize(RefWindow*, POINT);
bool HitSliderBar(RefWindow*, POINT), HitSliderThumb(RefWindow*, POINT, float);
void TogglePin(RefWindow*), ToggleLock(RefWindow*);
void CleanupWindow(RefWindow*), CleanupAll();
GifGeom CalcGifGeom(RefWindow*);
int HitGifBtn(RefWindow*, POINT);
bool HitGifTrackRect(RefWindow*, POINT);
void LoadGifFrame(RefWindow*, int, bool);
void GifTogglePlay(RefWindow*);
void GifGoTo(RefWindow*, int);
void GifApplyTrackX(RefWindow*, float);
bool ParseGifManifest(const std::wstring&, RefWindow*);
void DrawGifControls(RefWindow*);
RefWindow* CreateRefWindow(const std::wstring&);
int capDecodeW(RefWindow* rw, int wantedW) {
    double mp = (double)wantedW * wantedW * (double)rw->ih / (double)rw->iw / 1e6;
    if (mp > MAX_DECODE_MP)
        return (int)std::sqrt(MAX_DECODE_MP * 1e6 * (double)rw->iw / (double)rw->ih);
    return wantedW;
}
// ===== 原生 GIF 解码：WIC 逐帧解码 + 合成（disposal/透明/子矩形），使 --image 直接打开 GIF 也能动 =====
static bool MetaGetInt(IWICMetadataQueryReader* r, const wchar_t* path, UINT* out) {
    PROPVARIANT v; PropVariantInit(&v);
    if (FAILED(r->GetMetadataByName(path, &v))) { PropVariantClear(&v); return false; }
    if (v.vt == VT_UI1) *out = v.bVal;
    else if (v.vt == VT_UI2) *out = v.uiVal;
    else if (v.vt == VT_UI4) *out = v.ulVal;
    else if (v.vt == VT_I1) *out = (UINT)v.cVal;
    else if (v.vt == VT_I2) *out = (UINT)v.iVal;
    else if (v.vt == VT_I4) *out = (UINT)v.lVal;
    else { PropVariantClear(&v); return false; }
    PropVariantClear(&v);
    return true;
}
static void GifClearRect(std::vector<BYTE>& comp, UINT W, UINT H, UINT left, UINT top, UINT iw, UINT ih) {
    for (UINT y = 0; y < ih; y++) {
        UINT dy = top + y; if (dy >= H) break;
        for (UINT x = 0; x < iw; x++) {
            UINT dx = left + x; if (dx >= W) break;
            UINT di = (dy * W + dx) * 4;
            comp[di] = comp[di + 1] = comp[di + 2] = comp[di + 3] = 0;
        }
    }
}
static void GifPutPatch(std::vector<BYTE>& comp, UINT W, UINT H, const BYTE* px, UINT fw, UINT fh, UINT left, UINT top, UINT iw, UINT ih) {
    UINT cw = std::min(fw, iw), ch = std::min(fh, ih);
    for (UINT y = 0; y < ch; y++) {
        UINT dy = top + y; if (dy >= H) break;
        for (UINT x = 0; x < cw; x++) {
            UINT dx = left + x; if (dx >= W) break;
            UINT si = (y * fw + x) * 4;
            BYTE a = px[si + 3];
            if (a == 0) continue;  // 透明像素不覆盖画布
            UINT di = (dy * W + dx) * 4;
            comp[di] = px[si]; comp[di + 1] = px[si + 1]; comp[di + 2] = px[si + 2]; comp[di + 3] = a;
        }
    }
}
static ComPtr<IWICBitmap> ScaleWicBitmap(IWICBitmapSource* src, UINT srcW, UINT srcH, UINT targetW) {
    ComPtr<IWICBitmap> out;
    if (targetW >= srcW) {
        if (SUCCEEDED(g_wic->CreateBitmapFromSource(src, WICBitmapCacheOnLoad, &out))) return out;
        return nullptr;
    }
    UINT targetH = (UINT)((double)targetW * (double)srcH / (double)srcW);
    if (targetH == 0) targetH = 1;
    ComPtr<IWICBitmapScaler> scaler;
    if (FAILED(g_wic->CreateBitmapScaler(&scaler))) return nullptr;
    if (FAILED(scaler->Initialize(src, targetW, targetH, (WICBitmapInterpolationMode)4))) return nullptr;
    if (FAILED(g_wic->CreateBitmapFromSource(scaler.Get(), WICBitmapCacheOnLoad, &out))) return nullptr;
    return out;
}
// 从内存中的 WIC 位图解码出 D2D 位图（按需缩放到 decodeW），结果写入 rw->wicBmpCache / rw->imageBmp
bool LoadGifFromWic(RefWindow* rw, IWICBitmap* src, int decodeW) {
    UINT sw = 0, sh = 0; src->GetSize(&sw, &sh);
    int targetW = decodeW, targetH = 0;
    if (targetW > 0 && targetW < (int)sw) targetH = (int)((double)targetW * (double)sh / (double)sw);
    else { targetW = (int)sw; targetH = (int)sh; }
    ComPtr<IWICBitmapSource> s = src; ComPtr<IWICBitmapScaler> scaler; ComPtr<IWICFormatConverter> conv;
    HRESULT hr;
    if (decodeW > 0 && decodeW < (int)sw) {
        hr = g_wic->CreateBitmapScaler(&scaler);
        if (SUCCEEDED(hr)) hr = scaler->Initialize(src, (UINT)targetW, (UINT)targetH, (WICBitmapInterpolationMode)4);
        if (SUCCEEDED(hr)) s = scaler;
    }
    hr = g_wic->CreateFormatConverter(&conv);
    if (FAILED(hr)) return false;
    hr = conv->Initialize(s.Get(), GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone, nullptr, 0.f, WICBitmapPaletteTypeMedianCut);
    if (FAILED(hr)) return false;
    rw->wicBmpCache = nullptr;
    hr = g_wic->CreateBitmapFromSource(conv.Get(), WICBitmapCacheOnLoad, &rw->wicBmpCache);
    if (FAILED(hr)) return false;
    rw->wicBmpCacheW = decodeW;
    rw->imageBmp = nullptr;
    hr = rw->rt->CreateBitmapFromWicBitmap(rw->wicBmpCache.Get(), nullptr, &rw->imageBmp);
    if (SUCCEEDED(hr)) rw->decodeW = decodeW;
    return SUCCEEDED(hr);
}
int GifFrameCount(RefWindow* rw) {
    return rw->gifSrcFrames.empty() ? (int)rw->gifFrames.size() : (int)rw->gifSrcFrames.size();
}
// 解码 GIF 所有帧并合成为完整帧，写入 rw->gifSrcFrames / rw->gifDelays；非 GIF 或失败返回 false
bool DecodeGifNative(RefWindow* rw, const std::wstring& imagePath) {
    ComPtr<IWICBitmapDecoder> dec;
    if (FAILED(g_wic->CreateDecoderFromFilename(imagePath.c_str(), nullptr, GENERIC_READ, WICDecodeMetadataCacheOnDemand, &dec))) return false;
    GUID contFmt = {};
    if (FAILED(dec->GetContainerFormat(&contFmt)) || contFmt != GUID_ContainerFormatGif) return false;
    UINT frameCount = 0;
    if (FAILED(dec->GetFrameCount(&frameCount)) || frameCount == 0) return false;

    UINT W = 0, H = 0;
    { ComPtr<IWICMetadataQueryReader> mr; if (SUCCEEDED(dec->GetMetadataQueryReader(&mr))) { MetaGetInt(mr.Get(), L"/logscrdesc/Width", &W); MetaGetInt(mr.Get(), L"/logscrdesc/Height", &H); } }
    if (W == 0 || H == 0) {
        ComPtr<IWICBitmapFrameDecode> f0;
        if (FAILED(dec->GetFrame(0, &f0))) return false;
        f0->GetSize(&W, &H);
    }
    if (W == 0 || H == 0) return false;
    rw->iw = (int)W; rw->ih = (int)H;

    int capW = capDecodeW(rw, (int)W);
    std::vector<BYTE> comp((size_t)W * H * 4, 0);
    std::vector<BYTE> snap;
    rw->gifSrcFrames.clear();
    rw->gifDelays.clear();

    UINT prevDisposal = 0, prevLeft = 0, prevTop = 0, prevIw = W, prevIh = H;
    for (UINT i = 0; i < frameCount; i++) {
        ComPtr<IWICBitmapFrameDecode> frame;
        if (FAILED(dec->GetFrame(i, &frame))) { rw->gifSrcFrames.clear(); rw->gifDelays.clear(); return false; }

        UINT left = 0, top = 0, iw = W, ih = H, delay = 10, disposal = 0;
        { ComPtr<IWICMetadataQueryReader> mr; if (SUCCEEDED(frame->GetMetadataQueryReader(&mr))) {
            MetaGetInt(mr.Get(), L"/imgdesc/Left", &left);
            MetaGetInt(mr.Get(), L"/imgdesc/Top", &top);
            UINT t = 0; if (MetaGetInt(mr.Get(), L"/imgdesc/Width", &t) && t) iw = t;
            t = 0; if (MetaGetInt(mr.Get(), L"/imgdesc/Height", &t) && t) ih = t;
            MetaGetInt(mr.Get(), L"/grctlext/Delay", &delay);      // 单位：厘秒（1/100s）
            MetaGetInt(mr.Get(), L"/grctlext/Disposal", &disposal);
        }}

        ComPtr<IWICFormatConverter> conv;
        if (FAILED(g_wic->CreateFormatConverter(&conv)) ||
            FAILED(conv->Initialize(frame.Get(), GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone, nullptr, 0.f, WICBitmapPaletteTypeMedianCut))) {
            rw->gifSrcFrames.clear(); rw->gifDelays.clear(); return false;
        }
        UINT fw = 0, fh = 0; conv->GetSize(&fw, &fh);
        std::vector<BYTE> px((size_t)fw * fh * 4);
        { WICRect rc = { 0, 0, (INT)fw, (INT)fh };
          if (FAILED(conv->CopyPixels(&rc, (UINT)(fw * 4), (UINT)px.size(), px.data()))) { rw->gifSrcFrames.clear(); rw->gifDelays.clear(); return false; } }

        // 应用前一帧的 disposal
        if (i > 0) {
            if (prevDisposal == 2) GifClearRect(comp, W, H, prevLeft, prevTop, prevIw, prevIh);
            else if (prevDisposal == 3 && !snap.empty()) comp = snap;
        }
        if (disposal == 3) snap = comp;  // 记录「画本帧之前」的画布，供下一帧恢复

        GifPutPatch(comp, W, H, px.data(), fw, fh, left, top, iw, ih);

        ComPtr<IWICBitmap> full;
        if (FAILED(g_wic->CreateBitmapFromMemory(W, H, GUID_WICPixelFormat32bppPBGRA, (UINT)(W * 4), (UINT)comp.size(), comp.data(), &full))) {
            rw->gifSrcFrames.clear(); rw->gifDelays.clear(); return false;
        }
        ComPtr<IWICBitmap> stored = ScaleWicBitmap(full.Get(), W, H, (UINT)capW);
        if (!stored) { rw->gifSrcFrames.clear(); rw->gifDelays.clear(); return false; }
        rw->gifSrcFrames.push_back(stored);
        rw->gifDelays.push_back((int)std::max(20u, delay * 10u));  // 厘秒→毫秒，最小 20ms

        prevDisposal = disposal; prevLeft = left; prevTop = top; prevIw = iw; prevIh = ih;
    }
    dbg(L"native GIF decoded: %u frames %ux%u delay0=%dms", frameCount, W, H, rw->gifDelays.empty() ? 0 : rw->gifDelays[0]);
    return !rw->gifSrcFrames.empty();
}
std::wstring GetArg(int argc, wchar_t** argv, const wchar_t* key) {
    for (int i = 0; i < argc - 1; i++)
        if (_wcsicmp(argv[i], key) == 0) return argv[i + 1];
    return L"";
}
RECT GetWA() { RECT r; SystemParametersInfoW(SPI_GETWORKAREA, 0, &r, 0); return r; }
// payload for WM_COPYDATA: x, y then null-terminated path/manifest
struct CopyDataPayload { int x, y; };
int calcX(const RECT& wa, int dw, int off) {
    if (g_startX >= 0) return g_startX;
    int x = (wa.right - dw) / 2 + off;
    if (x + dw > wa.right) x = wa.left + ((off % (wa.right - wa.left - dw > 0 ? wa.right - wa.left - dw : 1)));
    if (x + dw > wa.right) x = wa.left;
    return x;
}
int calcY(const RECT& wa, int dh, int off) {
    if (g_startY >= 0) return g_startY;
    int y = (wa.bottom - dh) / 2 + off;
    if (y + dh > wa.bottom) y = wa.top + ((off % (wa.bottom - wa.top - dh > 0 ? wa.bottom - wa.top - dh : 1)));
    if (y + dh > wa.bottom) y = wa.top;
    return y;
}
float Q(float raw) {
    int steps = (int)std::roundf((raw - OPACITY_MIN) / OPACITY_STEP);
    if (steps < 0) return OPACITY_MIN; if (steps > 17) return OPACITY_MAX;
    float v = OPACITY_MIN + steps * OPACITY_STEP;
    if (v < OPACITY_MIN) v = OPACITY_MIN; if (v > OPACITY_MAX) v = OPACITY_MAX;
    return v;
}
bool CreateDibAndRt(RefWindow* rw) {
    DestroyDibAndRt(rw);
    int w = rw->windowW > 0 ? rw->windowW : 1, h = rw->windowH > 0 ? rw->windowH : 1;
    BITMAPINFO bmi = {}; bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = w; bmi.bmiHeader.biHeight = -h;
    bmi.bmiHeader.biPlanes = 1; bmi.bmiHeader.biBitCount = 32; bmi.bmiHeader.biCompression = BI_RGB;
    HDC screenDC = GetDC(nullptr);
    rw->dib = CreateDIBSection(screenDC, &bmi, DIB_RGB_COLORS, (void**)&rw->dibBits, nullptr, 0);
    ReleaseDC(nullptr, screenDC);
    if (!rw->dib) { dbg(L"CreateDIBSection failed"); return false; }
    rw->memDC = CreateCompatibleDC(nullptr);
    if (!rw->memDC) { dbg(L"CreateCompatibleDC failed"); DestroyDibAndRt(rw); return false; }
    rw->oldBmp = (HBITMAP)SelectObject(rw->memDC, rw->dib);
    memset(rw->dibBits, 0, (size_t)w * h * 4);
    auto props = D2D1::RenderTargetProperties(D2D1_RENDER_TARGET_TYPE_DEFAULT,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED),
        0, 0, D2D1_RENDER_TARGET_USAGE_NONE, D2D1_FEATURE_LEVEL_DEFAULT);
    HRESULT hr = g_d2dFactory->CreateDCRenderTarget(&props, &rw->rt);
    if (FAILED(hr)) { dbg(L"CreateDCRenderTarget failed 0x%08X", hr); DestroyDibAndRt(rw); return false; }
    RECT br = {0, 0, w, h}; hr = rw->rt->BindDC(rw->memDC, &br);
    if (FAILED(hr)) { dbg(L"BindDC failed 0x%08X", hr); DestroyDibAndRt(rw); return false; }
    return true;
}
void DestroyDibAndRt(RefWindow* rw) {
    rw->imageBmp = nullptr; rw->rt = nullptr;
    if (rw->memDC) {
        if (rw->oldBmp) SelectObject(rw->memDC, rw->oldBmp);
        DeleteDC(rw->memDC); rw->memDC = nullptr; rw->oldBmp = nullptr;
    }
    if (rw->dib) { DeleteObject(rw->dib); rw->dib = nullptr; rw->dibBits = nullptr; }
}
bool DecodeDims(RefWindow* rw, const std::wstring& imagep) {
    ComPtr<IWICBitmapDecoder> dec;
    HRESULT hr = g_wic->CreateDecoderFromFilename(imagep.c_str(), nullptr, GENERIC_READ, WICDecodeMetadataCacheOnDemand, &dec);
    if (FAILED(hr)) return false;
    ComPtr<IWICBitmapFrameDecode> frame; hr = dec->GetFrame(0, &frame);
    if (FAILED(hr)) return false;
    hr = frame->GetSize((UINT*)&rw->iw, (UINT*)&rw->ih);
    return SUCCEEDED(hr);
}
bool SetupWindow(RefWindow* rw, int off) {
    rw->aspect = (double)rw->iw / rw->ih;
    RECT wa = GetWA();
    int maxW = (int)(wa.right * INITIAL_WINDOW_FACTOR), maxH = (int)(wa.bottom * INITIAL_WINDOW_FACTOR);
    double scv = (std::min)(1.0, (std::min)((double)maxW / rw->iw, (double)maxH / rw->ih));
    int dw = (int)(rw->iw * scv), dh = (int)(rw->ih * scv);
    rw->initW = dw; rw->windowW = dw; rw->windowH = dh;
    HINSTANCE hInst = GetModuleHandleW(nullptr);
    std::wstring winTitle = rw->imagePath;
    auto p = winTitle.find_last_of(L"\\/");
    if (p != std::wstring::npos) winTitle = winTitle.substr(p + 1);
    if (rw->isGif) winTitle = L"GIF " + winTitle;
    rw->hwnd = CreateWindowExW(WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_APPWINDOW,
        L"PicRandRefBoard4", winTitle.c_str(), WS_POPUP,
        calcX(wa, dw, off), calcY(wa, dh, off), dw, dh,
        nullptr, nullptr, hInst, rw);
    if (!rw->hwnd) { return false; }
    SetWindowLongPtrW(rw->hwnd, GWLP_USERDATA, (LONG_PTR)rw);
    int initialDecodeW = capDecodeW(rw, dw);
    rw->decodeW = initialDecodeW;
    if (!CreateDibAndRt(rw)) { DestroyWindow(rw->hwnd); rw->hwnd = nullptr; return false; }
    LoadImage(rw, initialDecodeW);
    rw->dirty = true;
    return true;
}
RefWindow* CreateRefWindow(const std::wstring& imagePath) {
    RefWindow* rw = new RefWindow(); rw->imagePath = imagePath;
    if (!DecodeDims(rw, imagePath)) { delete rw; return nullptr; }
    bool gif = DecodeGifNative(rw, imagePath);  // 非 GIF 或解码失败均返回 false
    if (gif) {
        rw->isGif = true; rw->gifIdx = 0; rw->gifPlaying = true;
        rw->gifBmpCache.assign(rw->gifSrcFrames.size(), nullptr);
        rw->gifBmpCacheW.assign(rw->gifSrcFrames.size(), -1);
    }
    int off = (g_startX >= 0) ? 0 : (g_windowOffset * 30); g_windowOffset++;
    if (!SetupWindow(rw, off)) { delete rw; return nullptr; }
    if (gif) {
        if (rw->gifSrcFrames.size() > 1) SetTimer(rw->hwnd, GIF_TIMER_ID, GIF_TICK_MS, nullptr);
        rw->gifAccumMs = 0; rw->gifLastTick = timeGetTime();
    }
    return rw;
}
RefWindow* CreateGifRefWindow(const std::wstring& manifestPath) {
    RefWindow* rw = new RefWindow();
    rw->isGif = true; rw->gifIdx = 0; rw->gifPlaying = true;
    if (!ParseGifManifest(manifestPath, rw) || rw->gifFrames.empty()) { delete rw; return nullptr; }
    int gcnt = (int)rw->gifFrames.size();
    rw->gifBmpCache.resize(gcnt); rw->gifBmpCacheW.resize(gcnt); for (int k=0;k<gcnt;k++) rw->gifBmpCacheW[k] = -1;
    rw->imagePath = rw->gifFrames[0];
    if (!DecodeDims(rw, rw->imagePath)) { delete rw; return nullptr; }
    int off = (g_startX >= 0) ? 0 : (g_windowOffset * 30); g_windowOffset++;
    if (!SetupWindow(rw, off)) { delete rw; return nullptr; }
    if (rw->gifFrames.size() > 1 && rw->gifPlaying)
        SetTimer(rw->hwnd, GIF_TIMER_ID, GIF_TICK_MS, nullptr);
    rw->gifAccumMs = 0; rw->gifLastTick = timeGetTime();
    return rw;
}
LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    RefWindow* rw = (RefWindow*)GetWindowLongPtrW(hwnd, GWLP_USERDATA);
    if (!rw) return DefWindowProcW(hwnd, msg, wParam, lParam);
    switch (msg) {
    case WM_NCHITTEST: {
        LRESULT def = DefWindowProcW(hwnd, msg, wParam, lParam);
        if (def == HTCLIENT) {
            POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) }; ScreenToClient(hwnd, &pt);
            if (HitPin(pt) || HitLock(pt) || HitClose(rw, pt) || HitMinimize(rw, pt) || HitSliderBar(rw, pt) || HitGifBtn(rw, pt) >= 0 || HitGifTrackRect(rw, pt))
                return HTCLIENT;
            if (rw->locked) return HTTRANSPARENT;
            if (GetAsyncKeyState(VK_MBUTTON) & 0x8000) return HTCLIENT;
            if (GetAsyncKeyState(VK_MENU) & 0x8000) return HTCLIENT;
            if (GetAsyncKeyState(VK_CONTROL) & 0x8000) return HTCLIENT;
            return HTCAPTION;
        }
        return def;
    }
    case WM_SETCURSOR: {
        if (LOWORD(lParam) == HTCLIENT && (GetAsyncKeyState(VK_CONTROL) & 0x8000)) {
            SetCursor(LoadCursorW(nullptr, IDC_HAND)); return TRUE;
        }
        return DefWindowProcW(hwnd, msg, wParam, lParam);
    }
    case WM_SYSCOMMAND:
        if ((wParam & 0xFFF0) == SC_MOUSEMENU) return 0;
        return DefWindowProcW(hwnd, msg, wParam, lParam);
    case WM_NCRBUTTONDOWN:
    case WM_RBUTTONUP: {
        POINT pt; GetCursorPos(&pt);
        HMENU menu = CreatePopupMenu();
        AppendMenuW(menu, MF_STRING | (rw->flipH ? MF_CHECKED : 0), IDM_FLIP_H, g_menuLabels[0][localeIdx()]);
        AppendMenuW(menu, MF_STRING | (rw->flipV ? MF_CHECKED : 0), IDM_FLIP_V, g_menuLabels[1][localeIdx()]);
        AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
        AppendMenuW(menu, MF_STRING, IDM_RESET, g_menuLabels[2][localeIdx()]);
        AppendMenuW(menu, MF_STRING, IDM_DUPLICATE, g_menuLabels[3][localeIdx()]);
        AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
        AppendMenuW(menu, MF_STRING, IDM_CLOSE, g_menuLabels[4][localeIdx()]);
        UINT cmd = (UINT)TrackPopupMenu(menu, TPM_RETURNCMD | TPM_NONOTIFY, pt.x, pt.y, 0, hwnd, nullptr);
        DestroyMenu(menu);
        switch (cmd) {
            case IDM_FLIP_H: rw->flipH = !rw->flipH; RenderFrame(rw); rw->dirty = true; break;
            case IDM_FLIP_V: rw->flipV = !rw->flipV; RenderFrame(rw); rw->dirty = true; break;
            case IDM_RESET: rw->contentScale = 1.0f; rw->panX = rw->panY = 0; rw->rotation = 0.0f; rw->flipH = rw->flipV = false; LoadImage(rw, capDecodeW(rw, (int)(rw->windowW))); RenderFrame(rw); rw->dirty = true; break;
            case IDM_DUPLICATE: {
                RefWindow* dup = CreateRefWindow(rw->imagePath);
                if (dup) {
                    dup->pinned = rw->pinned; dup->opacity = rw->opacity; dup->contentScale = rw->contentScale;
                    dup->panX = rw->panX; dup->panY = rw->panY; dup->rotation = rw->rotation; dup->flipH = rw->flipH; dup->flipV = rw->flipV;
                    g_windows.push_back(dup); ShowWindow(dup->hwnd, SW_SHOW); RenderFrame(dup);
                }
                break;
            }
            case IDM_CLOSE: PostMessageW(hwnd, WM_CLOSE, 0, 0); break;
        }
        return 0;
    }
    case WM_LBUTTONDBLCLK: {
        POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
        if (rw->isGif) {
            int gb = HitGifBtn(rw, pt);
            if (gb >= 0) {
                if (gb == 0) GifGoTo(rw, 0);
                else if (gb == 1) GifGoTo(rw, rw->gifIdx - 1);
                else if (gb == 2) GifTogglePlay(rw);
                else if (gb == 3) GifGoTo(rw, rw->gifIdx + 1);
                else if (gb == 4) GifGoTo(rw, (int)rw->gifFrames.size() - 1);
                return 0;
            }
            if (HitGifTrackRect(rw, pt)) return 0;
        }
        TogglePin(rw); return 0;
    }
    case WM_MBUTTONDOWN: rw->contentScale = 1.0f; rw->panX = rw->panY = 0; rw->rotation = 0.0f; rw->flipH = rw->flipV = false; LoadImage(rw, capDecodeW(rw, (int)(rw->windowW))); RenderFrame(rw); rw->dirty = true; return 0;
    case WM_LBUTTONDOWN: {
        POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
        float bl = (rw->windowW - SLIDER_BAR_W) * 0.5f;
        if (rw->isGif) {
            int gb = HitGifBtn(rw, pt);
            if (gb >= 0) {
                SetCapture(hwnd);
                if (gb == 0) GifGoTo(rw, 0);
                else if (gb == 1) GifGoTo(rw, rw->gifIdx - 1);
                else if (gb == 2) GifTogglePlay(rw);
                else if (gb == 3) GifGoTo(rw, rw->gifIdx + 1);
                else if (gb == 4) GifGoTo(rw, (int)rw->gifFrames.size() - 1);
                return 0;
            }
            if (HitGifTrackRect(rw, pt)) {
                rw->gifDraggingTrack = true;
                rw->gifWasPlayingBeforeDrag = rw->gifPlaying;
                if (rw->gifPlaying) { KillTimer(hwnd, GIF_TIMER_ID); rw->gifPlaying = false; }
                GifApplyTrackX(rw, (float)pt.x);
                SetCapture(hwnd);
                return 0;
            }
        }
        if (HitClose(rw, pt)) PostMessageW(hwnd, WM_CLOSE, 0, 0);
        else if (HitMinimize(rw, pt)) ShowWindow(hwnd, SW_MINIMIZE);
        else if (HitPin(pt)) TogglePin(rw);
        else if (HitLock(pt)) ToggleLock(rw);
        else if (HitSliderBar(rw, pt) && !HitSliderThumb(rw, pt, bl)) {
            rw->opacity = Q(SliderFromX(rw, (float)pt.x, bl)); RenderFrame(rw); rw->dirty = true;
        }
        else if (HitSliderThumb(rw, pt, bl)) rw->draggingSlider = true;
        else if (wParam & MK_CONTROL) {
            rw->ctrlDragging = true; rw->dragStartX = pt.x; rw->dragStartY = pt.y;
            rw->panStartX = rw->panX; rw->panStartY = rw->panY;
            SetCursor(LoadCursorW(nullptr, IDC_HAND));
        }
        SetCapture(hwnd); return 0;
    }
    case WM_LBUTTONUP:
        if (rw->gifDraggingTrack && rw->gifWasPlayingBeforeDrag && !rw->gifPlaying) {
            rw->gifPlaying = true;
            SetTimer(hwnd, GIF_TIMER_ID, GIF_TICK_MS, nullptr);
            rw->gifAccumMs = 0; rw->gifLastTick = timeGetTime();
            RenderFrame(rw); rw->dirty = true;
        }
        rw->gifDraggingTrack = false; rw->gifWasPlayingBeforeDrag = false;
        rw->ctrlDragging = false; rw->draggingSlider = false; ReleaseCapture(); return 0;
    case WM_MOUSEMOVE: {
        if (rw->gifDraggingTrack) { GifApplyTrackX(rw, (float)GET_X_LPARAM(lParam)); RenderFrame(rw); rw->dirty = true; return 0; }
        if (rw->ctrlDragging) {
            SetCursor(LoadCursorW(nullptr, IDC_HAND));
            POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
            float dx = (float)(pt.x - rw->dragStartX), dy = (float)(pt.y - rw->dragStartY);
            if (rw->rotation != 0.0f) {
                float rad = rw->rotation * 3.14159265f / 180.0f;
                float c = cosf(rad), s = sinf(rad);
                float rdx = dx * c + dy * s;
                float rdy = -dx * s + dy * c;
                dx = rdx; dy = rdy;
            }
            // 渲染矩阵 M = Rotation × Scale(flip)，鼠标 delta 需做 M⁻¹ = Scale × Rotation⁻¹ 反变换。
            // 上方已做 Rotation⁻¹；翻转是自逆的，故 flipH 时 dx 取反、flipV 时 dy 取反，否则该轴拖拽方向相反。
            if (rw->flipH) dx = -dx;
            if (rw->flipV) dy = -dy;
            rw->panX = rw->panStartX + dx;
            rw->panY = rw->panStartY + dy;
            RenderFrame(rw); rw->dirty = true;
        }
        if (rw->draggingSlider) {
            float bl = (rw->windowW - SLIDER_BAR_W) * 0.5f;
            float newOpacity = Q(SliderFromX(rw, (float)GET_X_LPARAM(lParam), bl));
            if (newOpacity != rw->opacity) { rw->opacity = newOpacity; RenderFrame(rw); rw->dirty = true; }
        }
        return 0;
    }
    case WM_MOUSEWHEEL: {
        if (wParam & MK_CONTROL) {
            float f = GET_WHEEL_DELTA_WPARAM(wParam) > 0 ? 1.08f : 0.92f;
            float newScale = rw->contentScale * f;
            POINT mouse = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) }; ScreenToClient(hwnd, &mouse);
            float cx = (float)rw->windowW * 0.5f, cy = (float)rw->windowH * 0.5f;
            float mx = (float)mouse.x - cx, my = (float)mouse.y - cy;
            if (rw->rotation != 0.0f) {
                float rad = rw->rotation * 3.14159265f / 180.0f;
                float c = cosf(rad), s = sinf(rad);
                float rmx = mx * c + my * s;
                float rmy = -mx * s + my * c;
                mx = rmx; my = rmy;
            }
            rw->panX = (1.0f - f) * mx + f * rw->panX;
            rw->panY = (1.0f - f) * my + f * rw->panY;
            rw->contentScale = newScale;
            int needW = (int)((double)rw->windowW * newScale);
            needW = capDecodeW(rw, needW); if (needW >= rw->iw) needW = 0;
            if (needW != rw->decodeW) LoadImage(rw, needW);
            RenderFrame(rw); rw->dirty = true; return 0;
        }
        if (GetAsyncKeyState(VK_MENU) & 0x8000) {
            // 滚轮向上(delta>0)逆时针、滚轮向下顺时针,符合"上抬下压"的自然直觉。
            // Direct2D Y 轴向下,正角度=顺时针,故 delta 与角度反号。
            float da = GET_WHEEL_DELTA_WPARAM(wParam) > 0 ? -2.5f : 2.5f;
            rw->rotation = fmodf(rw->rotation + da, 360.0f);
            if (rw->rotation < 0) rw->rotation += 360.0f;
            RenderFrame(rw); rw->dirty = true; return 0;
        }
        double f = GET_WHEEL_DELTA_WPARAM(wParam) > 0 ? ZOOM_FACTOR_UP : ZOOM_FACTOR_DOWN;
        rw->pendingZoom *= f;
        if (!rw->zoomScheduled) { rw->zoomScheduled = true; SetTimer(hwnd, ZOOM_TIMER_ID, ZOOM_COOLDOWN_MS, nullptr); }
        return 0;
    }    case WM_TIMER: {
        if (wParam == ZOOM_TIMER_ID) {
            KillTimer(hwnd, ZOOM_TIMER_ID); rw->zoomScheduled = false;
            double factor = rw->pendingZoom; rw->pendingZoom = 1.0;
            if (factor < 0.9999 || factor > 1.0001) {
                int newW = (int)((double)rw->windowW * factor + 0.5);
                if (newW < MIN_WINDOW_WIDTH) newW = MIN_WINDOW_WIDTH;
                RECT wa = GetWA(); if (newW > wa.right) newW = wa.right;
                int newH = (int)((double)newW / rw->aspect + 0.5);
                if (newH > wa.bottom) { newH = wa.bottom; newW = (int)((double)newH * rw->aspect + 0.5); }
                RECT wr; GetWindowRect(hwnd, &wr);
                int cx = (wr.left + wr.right) / 2, cy = (wr.top + wr.bottom) / 2;
                int nx = cx - newW / 2, ny = cy - newH / 2;
                if (ny < wa.top) ny = wa.top;
                double effectiveW = (double)newW * rw->contentScale;
                int needed = (int)effectiveW; needed = capDecodeW(rw, needed); if (needed >= rw->iw) needed = 0;
                bool needReload = ((double)std::abs(needed - rw->decodeW) > (double)rw->decodeW * 0.2);
                float actualFactor = (float)newW / (float)rw->windowW;
                rw->panX *= actualFactor; rw->panY *= actualFactor;
                rw->windowW = newW; rw->windowH = newH;
                DestroyDibAndRt(rw);
                if (CreateDibAndRt(rw)) {
                    LoadImage(rw, needReload ? needed : rw->decodeW);
                    RenderFrame(rw, true, nx, ny);
                }
                rw->dirty = false;
            }
        }
        if (wParam == GIF_TIMER_ID) {
            int cnt = GifFrameCount(rw);
            if (rw->isGif && rw->gifPlaying && cnt > 1) {
                DWORD now = timeGetTime();
                DWORD elapsed = now - rw->gifLastTick;
                rw->gifLastTick = now;
                rw->gifAccumMs += elapsed;
                int curDelay = std::max(20, rw->gifDelays[rw->gifIdx]);
                if ((int)rw->gifAccumMs >= curDelay) {
                    rw->gifAccumMs -= curDelay;
                    if ((int)rw->gifAccumMs > curDelay) rw->gifAccumMs = 0;
                    int n = (rw->gifIdx + 1) % cnt;
                    LoadGifFrame(rw, n, true);
                }
            } else { KillTimer(hwnd, GIF_TIMER_ID); }
            return 0;
        }
        if (wParam == LOCK_TRACK_TIMER_ID && rw->locked) {
            POINT pt; GetCursorPos(&pt); ScreenToClient(hwnd, &pt);
            bool overBtn = pt.x >= 0 && pt.y >= 0 && pt.x < rw->windowW && pt.y < rw->windowH &&
                (HitPin(pt) || HitLock(pt) || HitClose(rw, pt) || HitMinimize(rw, pt) || HitSliderBar(rw, pt) || (rw->isGif && (HitGifBtn(rw, pt) >= 0 || HitGifTrackRect(rw, pt))));
            auto ex = GetWindowLongPtrW(rw->hwnd, GWL_EXSTYLE);
            bool hasTransparent = (ex & WS_EX_TRANSPARENT) != 0;
            if (overBtn && hasTransparent) SetWindowLongPtrW(rw->hwnd, GWL_EXSTYLE, ex & ~WS_EX_TRANSPARENT);
            else if (!overBtn && !hasTransparent) SetWindowLongPtrW(rw->hwnd, GWL_EXSTYLE, ex | WS_EX_TRANSPARENT);
        }
        return 0;
    }
    case WM_ENTERSIZEMOVE:
        rw->inSizeMove = true;
        { RECT wr; GetWindowRect(hwnd, &wr); rw->sizeMoveLeft = wr.left; rw->sizeMoveTop = wr.top; }
        return 0;
    case WM_SIZING: {
        RECT* pr = (RECT*)lParam;
        switch (wParam) {
            case WMSZ_BOTTOM: case WMSZ_BOTTOMRIGHT: case WMSZ_RIGHT:
                pr->left = rw->sizeMoveLeft; pr->top = rw->sizeMoveTop; break;
            case WMSZ_TOP: case WMSZ_TOPRIGHT:
                pr->left = rw->sizeMoveLeft; pr->bottom = rw->sizeMoveTop + (pr->bottom - pr->top); break;
            case WMSZ_LEFT: case WMSZ_TOPLEFT: case WMSZ_BOTTOMLEFT:
                pr->right = rw->sizeMoveLeft + (pr->right - pr->left); pr->top = rw->sizeMoveTop; break;
        }
        return TRUE;
    }
    case WM_EXITSIZEMOVE: {
        rw->inSizeMove = false;
        RECT wr; GetWindowRect(hwnd, &wr);
        int nw = wr.right - wr.left, nh = wr.bottom - wr.top;
        if (nw <= 0 || nh <= 0) return 0;
        if (nw == rw->windowW && nh == rw->windowH) return 0;
        SendMessageW(hwnd, WM_SIZE, 0, MAKELPARAM(nw, nh));
        return 0;
    }
    case WM_SIZE: {
        if (rw->inSizeMove) { rw->dirty = true; return 0; }
        int nw = LOWORD(lParam), nh = HIWORD(lParam);
        if (nw > 0 && nh > 0 && (nw != rw->windowW || nh != rw->windowH)) {
            float oldW = (float)rw->windowW, oldH = (float)rw->windowH;
            rw->windowW = nw; rw->windowH = nh;
            bool ratioChanged = (oldW <= 0 || oldH <= 0) || (std::abs((float)nw * oldH - (float)nh * oldW) > 0.01f * oldW * oldH);
            if (ratioChanged && rw->imageBmp) {
                auto oldSz = rw->imageBmp->GetSize();
                float oldCx = oldW * 0.5f, oldCy = oldH * 0.5f;
                float sx = oldW / oldSz.width, sy = oldH / oldSz.height;
                float baseOld = (std::min)(sx, sy), effScale = baseOld * rw->contentScale;
                float pCx = oldCx + rw->panX, pCy = oldCy + rw->panY;
                int needed = (int)((double)nw * rw->contentScale);
                needed = capDecodeW(rw, needed); if (needed >= rw->iw) needed = 0;
                DestroyDibAndRt(rw);
                if (CreateDibAndRt(rw)) {
                    LoadImage(rw, needed);
                    auto newSz = rw->imageBmp->GetSize();
                    float baseNew = (std::min)((float)nw / newSz.width, (float)nh / newSz.height);
                    if (baseNew > 0.0f) rw->contentScale = effScale / baseNew;
                    // contentScale minimum removed
                    float newCx = (float)nw * 0.5f, newCy = (float)nh * 0.5f;
                    rw->panX = pCx - newCx; rw->panY = pCy - newCy;
                    rw->skipClamp = true; RenderFrame(rw); rw->skipClamp = false;
                }
            } else {
                int needed = 0;
                { double effW = (double)nw * rw->contentScale; needed = (int)effW; needed = capDecodeW(rw, needed); if (needed >= rw->iw) needed = 0; }
                DestroyDibAndRt(rw);
                if (CreateDibAndRt(rw)) { LoadImage(rw, needed); RenderFrame(rw); }
            }
        }
        rw->dirty = true; return 0;
    }
    case WM_PAINT: { PAINTSTRUCT ps; BeginPaint(hwnd, &ps); EndPaint(hwnd, &ps); rw->dirty = true; return 0; }
    case WM_MOVING: { RECT* pr = (RECT*)lParam; RECT wa = GetWA(); if (pr->top < wa.top) { int wh = pr->bottom - pr->top; pr->top = wa.top; pr->bottom = wa.top + wh; } return TRUE; }
    case WM_KEYDOWN:
        if (wParam == VK_ESCAPE) PostMessageW(hwnd, WM_CLOSE, 0, 0);
        else if (wParam == VK_SPACE) { if (rw->isGif) GifTogglePlay(rw); }
        else if (wParam == VK_LEFT) {
            if (GetAsyncKeyState(VK_CONTROL) & 0x8000) { if (rw->isGif) GifGoTo(rw, 0); }
            else if (rw->isGif) GifGoTo(rw, rw->gifIdx - 1);
        }
        else if (wParam == VK_RIGHT) {
            if (GetAsyncKeyState(VK_CONTROL) & 0x8000) { if (rw->isGif) GifGoTo(rw, (int)rw->gifFrames.size() - 1); }
            else if (rw->isGif) GifGoTo(rw, rw->gifIdx + 1);
        }
        return 0;
    case WM_CLOSE: DestroyWindow(hwnd); return 0;
    case WM_DESTROY: {
        KillTimer(hwnd, LOCK_TRACK_TIMER_ID); if (rw->isGif) KillTimer(hwnd, GIF_TIMER_ID); CleanupWindow(rw);
        auto it = std::find(g_windows.begin(), g_windows.end(), rw);
        if (it != g_windows.end()) g_windows.erase(it);
        delete rw;
        if (g_windows.empty()) { g_running = false; PostQuitMessage(0); }
        return 0;
    }
    case WM_ERASEBKGND: return 1;
    case WM_COPYDATA: {
        COPYDATASTRUCT* cds = (COPYDATASTRUCT*)lParam;
        if (cds->cbData >= sizeof(CopyDataPayload) && cds->lpData) {
            CopyDataPayload pl; memcpy(&pl, cds->lpData, sizeof(pl));
            g_startX = pl.x; g_startY = pl.y;
            const wchar_t* pstr = (const wchar_t*)((BYTE*)cds->lpData + sizeof(CopyDataPayload));
            std::wstring path(pstr);
            RefWindow* newRw = (cds->dwData == 2) ? CreateGifRefWindow(path) : CreateRefWindow(path);
            if (newRw) { g_windows.push_back(newRw); ShowWindow(newRw->hwnd, SW_SHOW); RenderFrame(newRw); }
        }
        return TRUE;
    }
    }
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}
void LoadImage(RefWindow* rw, int decodeW) {
    if (!rw->rt) return;
    rw->imageBmp = nullptr;
    // 原生 GIF：帧来自内存位图（gifSrcFrames），不走 imagePath 文件解码
    if (rw->isGif && !rw->gifSrcFrames.empty()) {
        int gi = rw->gifIdx;
        if (gi < 0 || gi >= (int)rw->gifSrcFrames.size()) gi = 0;
        LoadGifFromWic(rw, rw->gifSrcFrames[gi].Get(), decodeW);
        if ((int)rw->gifBmpCache.size() == (int)rw->gifSrcFrames.size()) {
            rw->gifBmpCache[gi] = rw->imageBmp;
            rw->gifBmpCacheW[gi] = rw->decodeW;
        }
        return;
    }
    if (rw->wicBmpCache && rw->wicBmpCacheW > 0 && (double)std::abs(rw->wicBmpCacheW - decodeW) < (double)rw->wicBmpCacheW * 0.2) {
        HRESULT hr = rw->rt->CreateBitmapFromWicBitmap(rw->wicBmpCache.Get(), nullptr, &rw->imageBmp);
        if (SUCCEEDED(hr)) { rw->decodeW = decodeW; return; }
    }
    rw->wicBmpCache = nullptr;
    ComPtr<IWICBitmapDecoder> dec;
    HRESULT hr = g_wic->CreateDecoderFromFilename(rw->imagePath.c_str(), nullptr, GENERIC_READ, WICDecodeMetadataCacheOnDemand, &dec);
    if (FAILED(hr)) return;
    ComPtr<IWICBitmapFrameDecode> frame; hr = dec->GetFrame(0, &frame);
    if (FAILED(hr)) return;
    int targetW = decodeW, targetH = 0;
    if (targetW > 0 && targetW < rw->iw) targetH = (int)((double)targetW * (double)rw->ih / (double)rw->iw);
    else { targetW = rw->iw; targetH = rw->ih; }
    {
        ComPtr<IWICFormatConverter> conv; ComPtr<IWICBitmapSource> src = frame; ComPtr<IWICBitmapScaler> scaler;
        if (decodeW > 0 && decodeW < rw->iw) {
            hr = g_wic->CreateBitmapScaler(&scaler);
            if (SUCCEEDED(hr)) hr = scaler->Initialize(frame.Get(), (UINT)decodeW, (UINT)targetH, (WICBitmapInterpolationMode)4);
            if (SUCCEEDED(hr)) src = scaler;
        }
        hr = g_wic->CreateFormatConverter(&conv);
        if (FAILED(hr)) return;
        hr = conv->Initialize(src.Get(), GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone, nullptr, 0.f, WICBitmapPaletteTypeMedianCut);
        if (FAILED(hr)) return;
        hr = g_wic->CreateBitmapFromSource(conv.Get(), WICBitmapCacheOnLoad, &rw->wicBmpCache);
        if (FAILED(hr)) return;
    }
    rw->wicBmpCacheW = decodeW;
    hr = rw->rt->CreateBitmapFromWicBitmap(rw->wicBmpCache.Get(), nullptr, &rw->imageBmp);
    if (SUCCEEDED(hr)) rw->decodeW = decodeW;
    if (rw->isGif && SUCCEEDED(hr)) {
        int gcnt = (int)rw->gifFrames.size();
        if ((int)rw->gifBmpCache.size() != gcnt) { rw->gifBmpCache.assign(gcnt, nullptr); rw->gifBmpCacheW.assign(gcnt, -1); }
        for (int k = 0; k < gcnt; k++) rw->gifBmpCacheW[k] = -1;
        int gi = rw->gifIdx;
        if (gi >= 0 && gi < gcnt) { rw->gifBmpCache[gi] = rw->imageBmp; rw->gifBmpCacheW[gi] = decodeW; }
    }
}
void RenderFrame(RefWindow* rw, bool updatePos, int x, int y) {
    if (!rw->rt || !rw->memDC) return;
    rw->rt->BeginDraw();
    rw->rt->Clear(D2D1::ColorF(0, 0, 0, 0));
    ComPtr<ID2D1SolidColorBrush> borderBr;
    rw->rt->CreateSolidColorBrush(D2D1::ColorF(0, 0, 0, 1), &borderBr);
    rw->rt->DrawRectangle(D2D1::RectF(0.5f, 0.5f, (float)rw->windowW - 0.5f, (float)rw->windowH - 0.5f), borderBr.Get(), 2.f);
    if (rw->imageBmp) {
        auto sz = rw->imageBmp->GetSize();
        float sx = (float)rw->windowW / sz.width, sy = (float)rw->windowH / sz.height;
        float baseScale = std::min(sx, sy), effScale = baseScale * rw->contentScale;
        float iwS = sz.width * effScale, ihS = sz.height * effScale;
        float maxPanX = (iwS - (float)rw->windowW) * 0.5f, maxPanY = (ihS - (float)rw->windowH) * 0.5f;
        if (maxPanX < 0) maxPanX = 0; if (maxPanY < 0) maxPanY = 0;
        
        float cx = (float)rw->windowW * 0.5f, cy = (float)rw->windowH * 0.5f;
        float pCx = cx + rw->panX, pCy = cy + rw->panY;
        D2D1_RECT_F dst = { pCx - iwS*0.5f, pCy - ihS*0.5f, pCx + iwS*0.5f, pCy + ihS*0.5f };
        if (rw->rotation != 0.0f || rw->flipH || rw->flipV) {
            auto mat = D2D1::Matrix3x2F::Rotation(rw->rotation, D2D1::Point2F(cx, cy)) *
                D2D1::Matrix3x2F::Scale(rw->flipH ? -1.f : 1.f, rw->flipV ? -1.f : 1.f, D2D1::Point2F(cx, cy));
            rw->rt->SetTransform(mat);
        }
        auto interp = (std::abs(effScale - 1.0f) < 0.02f) ? D2D1_BITMAP_INTERPOLATION_MODE_NEAREST_NEIGHBOR : D2D1_BITMAP_INTERPOLATION_MODE_LINEAR;
        rw->rt->DrawBitmap(rw->imageBmp.Get(), dst, rw->opacity, interp);
        if (rw->rotation != 0.0f || rw->flipH || rw->flipV) rw->rt->SetTransform(D2D1::IdentityMatrix());
    }
    ComPtr<ID2D1SolidColorBrush> br; rw->rt->CreateSolidColorBrush(D2D1::ColorF(1, 1, 1, 1), &br);
    D2D1_COLOR_F pinBg = rw->pinned ? BTN_BG_ACTIVE : BTN_BG; br->SetColor(pinBg);
    rw->rt->FillRectangle(D2D1::RectF(0, 0, BUTTON_GRID, BUTTON_GRID), br.Get());
    D2D1_COLOR_F pinIcon = rw->pinned ? ICON_COLOR_ON : ICON_COLOR_OFF; br->SetColor(pinIcon);
    { float cxB = BUTTON_GRID*0.5f, headR = 2.5f, headCY = BUTTON_GRID*0.38f;
        rw->rt->FillEllipse(D2D1::Ellipse({cxB, headCY}, headR, headR), br.Get());
        float st = headCY + headR, sb = st + 6.f; rw->rt->DrawLine({cxB, st}, {cxB, sb}, br.Get(), 1.f); }
    D2D1_COLOR_F lockBg = rw->locked ? BTN_BG_ACTIVE : BTN_BG; br->SetColor(lockBg);
    rw->rt->FillRectangle(D2D1::RectF(BUTTON_GRID, 0, BUTTON_GRID*2, BUTTON_GRID), br.Get());
    D2D1_COLOR_F lockIcon = rw->locked ? ICON_COLOR_ON : ICON_COLOR_OFF; br->SetColor(lockIcon);
    { float cx0 = BUTTON_GRID + BUTTON_GRID*0.5f, cyB = BUTTON_GRID*0.5f;
        DrawLockIcon(rw->rt.Get(), br.Get(), cx0, cyB); }
    float cx_min = (float)rw->windowW - BUTTON_GRID*2; br->SetColor(BTN_BG);
    rw->rt->FillRectangle(D2D1::RectF(cx_min, 0, cx_min + BUTTON_GRID, BUTTON_GRID), br.Get());
    br->SetColor(CLOSE_COLOR);
    { float cx0 = cx_min + BUTTON_GRID*0.5f, cy0 = BUTTON_GRID*0.5f; rw->rt->DrawLine({cx0 - 4.f, cy0}, {cx0 + 4.f, cy0}, br.Get(), 2.f); }
    float cx_close = (float)rw->windowW - BUTTON_GRID; br->SetColor(BTN_BG);
    rw->rt->FillRectangle(D2D1::RectF(cx_close, 0, cx_close + BUTTON_GRID, BUTTON_GRID), br.Get());
    br->SetColor(CLOSE_COLOR);
    { float cx0 = cx_close + BUTTON_GRID*0.5f, cy0 = BUTTON_GRID*0.5f, xo = 4.f;
        rw->rt->DrawLine({cx0 - xo, cy0 - xo}, {cx0 + xo, cy0 + xo}, br.Get(), CLOSE_STROKE_W);
        rw->rt->DrawLine({cx0 + xo, cy0 - xo}, {cx0 - xo, cy0 + xo}, br.Get(), CLOSE_STROKE_W); }
    if (rw->isGif) DrawGifControls(rw);
    float bl = (float)rw->windowW*0.5f - SLIDER_BAR_W*0.5f, bt = 4.f;
    DrawSlider(rw, rw->rt.Get(), bl, bt);
    HRESULT hr = rw->rt->EndDraw();
    if (SUCCEEDED(hr)) {
        HDC screenDC = GetDC(nullptr);
        BLENDFUNCTION blend = { AC_SRC_OVER, 0, 255, AC_SRC_ALPHA };
        SIZE size = { rw->windowW, rw->windowH }; POINT srcPt = {0, 0};
        POINT dstPt = {x, y}; POINT* pptDst = updatePos ? &dstPt : nullptr;
        UpdateLayeredWindow(rw->hwnd, screenDC, pptDst, &size, rw->memDC, &srcPt, 0, &blend, ULW_ALPHA);
        ReleaseDC(nullptr, screenDC);
    }
}
void DrawSlider(RefWindow* rw, ID2D1DCRenderTarget* rt, float barLeft, float barTop) {
    ComPtr<ID2D1SolidColorBrush> br; rt->CreateSolidColorBrush(SLIDER_BG, &br);
    rt->FillRectangle(D2D1::RectF(barLeft, barTop, barLeft + SLIDER_BAR_W, barTop + SLIDER_BAR_H), br.Get());
    float tl = barLeft + SLIDER_MARGIN, tr = barLeft + SLIDER_BAR_W - SLIDER_MARGIN;
    float ty = barTop + (SLIDER_BAR_H - SLIDER_TRACK_H)*0.5f, sw = tr - tl;
    float t = (rw->opacity - OPACITY_MIN) / (OPACITY_MAX - OPACITY_MIN), tx = tl + t * sw;
    br->SetColor(TRACK_FILLED); rt->FillRectangle(D2D1::RectF(tl, ty, tx, ty + SLIDER_TRACK_H), br.Get());
    br->SetColor(TRACK_UNFILLED); rt->FillRectangle(D2D1::RectF(tx, ty, tr, ty + SLIDER_TRACK_H), br.Get());
    br->SetColor(THUMB_COLOR); rt->FillEllipse(D2D1::Ellipse({tx, barTop + SLIDER_BAR_H*0.5f}, SLIDER_THUMB_R, SLIDER_THUMB_R), br.Get());
}
bool HitPin(POINT pt) { return pt.x >= 0 && pt.x < (LONG)BUTTON_GRID && pt.y >= 0 && pt.y < (LONG)BUTTON_GRID; }
bool HitLock(POINT pt) { return pt.x >= (LONG)BUTTON_GRID && pt.x < (LONG)BUTTON_GRID*2 && pt.y >= 0 && pt.y < (LONG)BUTTON_GRID; }
bool HitClose(RefWindow* rw, POINT pt) { return pt.x >= rw->windowW - (LONG)BUTTON_GRID && pt.x < rw->windowW && pt.y >= 0 && pt.y < (LONG)BUTTON_GRID; }
bool HitMinimize(RefWindow* rw, POINT pt) { return pt.x >= rw->windowW - (LONG)BUTTON_GRID*2 && pt.x < rw->windowW - (LONG)BUTTON_GRID && pt.y >= 0 && pt.y < (LONG)BUTTON_GRID; }
bool HitSliderBar(RefWindow* rw, POINT pt) {
    float bl = (float)rw->windowW*0.5f - SLIDER_BAR_W*0.5f, bt = 4.f;
    return pt.x >= bl && pt.x <= bl + SLIDER_BAR_W && pt.y >= bt && pt.y <= bt + SLIDER_BAR_H;
}
bool HitSliderThumb(RefWindow* rw, POINT pt, float bl) {
    if (bl == 0) bl = (rw->windowW - SLIDER_BAR_W)*.5f;
    float tl = bl + SLIDER_MARGIN, tr = bl + SLIDER_BAR_W - SLIDER_MARGIN;
    float t = (rw->opacity - OPACITY_MIN) / (OPACITY_MAX - OPACITY_MIN), tx = tl + t * (tr - tl);
    float ty = 4.f + SLIDER_BAR_H*.5f;
    float dx = pt.x - tx, dy = pt.y - ty;
    return (dx*dx + dy*dy) <= (SLIDER_THUMB_R+4)*(SLIDER_THUMB_R+4);
}
float SliderFromX(RefWindow* rw, float cx, float bl) {
    if (bl == 0) bl = (rw->windowW - SLIDER_BAR_W)*.5f;
    float tl = bl + SLIDER_MARGIN, tr = bl + SLIDER_BAR_W - SLIDER_MARGIN;
    float t = (cx - tl) / (tr - tl); if (t < 0) t = 0; if (t > 1) t = 1;
    return OPACITY_MIN + t * (OPACITY_MAX - OPACITY_MIN);
}
void TogglePin(RefWindow* rw) {
    rw->pinned = !rw->pinned;
    SetWindowPos(rw->hwnd, rw->pinned ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    if (!rw->pinned && rw->locked) {
        rw->locked = false;
        SetWindowLongPtrW(rw->hwnd, GWL_EXSTYLE, GetWindowLongPtrW(rw->hwnd, GWL_EXSTYLE) & ~WS_EX_TRANSPARENT);
        KillTimer(rw->hwnd, LOCK_TRACK_TIMER_ID);
    }
    RenderFrame(rw); rw->dirty = true;
}
void ToggleLock(RefWindow* rw) {
    rw->locked = !rw->locked;
    if (rw->locked) {
        if (!rw->pinned) {
            rw->pinned = true;
            SetWindowPos(rw->hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
        SetWindowLongPtrW(rw->hwnd, GWL_EXSTYLE, GetWindowLongPtrW(rw->hwnd, GWL_EXSTYLE) | WS_EX_TRANSPARENT);
        SetTimer(rw->hwnd, LOCK_TRACK_TIMER_ID, LOCK_TRACK_MS, nullptr);
    } else {
        SetWindowLongPtrW(rw->hwnd, GWL_EXSTYLE, GetWindowLongPtrW(rw->hwnd, GWL_EXSTYLE) & ~WS_EX_TRANSPARENT);
        KillTimer(rw->hwnd, LOCK_TRACK_TIMER_ID);
    }
    RenderFrame(rw); rw->dirty = true;
}
void CleanupWindow(RefWindow* rw) { rw->imageBmp = nullptr; rw->wicBmpCache = nullptr; if (rw->isGif) { std::vector<ComPtr<ID2D1Bitmap>>().swap(rw->gifBmpCache); std::vector<int>().swap(rw->gifBmpCacheW); std::vector<ComPtr<IWICBitmap>>().swap(rw->gifSrcFrames); std::vector<int>().swap(rw->gifDelays); } rw->rt = nullptr; DestroyDibAndRt(rw); }
void CleanupAll() { for (auto* rw : g_windows) { CleanupWindow(rw); delete rw; } g_windows.clear(); g_d2dFactory = nullptr; g_wic = nullptr; }

// ===== GIF frame playback support =====
bool ParseGifManifest(const std::wstring& path, RefWindow* rw) {
    try {
        std::ifstream f(path.c_str(), std::ios::binary);
        if (!f) return false;
        char magic[4]; f.read(magic, 4);
        if (!f || std::string(magic, 4) != "GIF1") return false;
        int32_t cnt = 0; f.read(reinterpret_cast<char*>(&cnt), 4);
        if (!f || cnt <= 0 || cnt > 5000) return false;
        std::vector<int32_t> delays(cnt); f.read(reinterpret_cast<char*>(delays.data()), (std::streamsize)(cnt * 4));
        if (!f) return false;
        rw->gifDelays.assign(cnt, 0);
        for (int i = 0; i < cnt; i++) rw->gifDelays[i] = std::max(20, (int)delays[i]);
        rw->gifFrames.clear(); rw->gifFrames.reserve(cnt);
        for (int i = 0; i < cnt; i++) {
            int32_t blen = 0; f.read(reinterpret_cast<char*>(&blen), 4);
            if (!f || blen < 0 || blen > 4096) return false;
            std::string u8((size_t)blen, 0); if (blen > 0) f.read(&u8[0], blen);
            if (!f) return false;
            int wlen = MultiByteToWideChar(CP_UTF8, 0, u8.c_str(), (int)u8.size(), nullptr, 0);
            std::wstring ws((size_t)wlen, 0);
            if (wlen > 0) MultiByteToWideChar(CP_UTF8, 0, u8.c_str(), (int)u8.size(), &ws[0], wlen);
            rw->gifFrames.push_back(ws);
        }
        return true;
    } catch (...) { return false; }
}
void LoadGifFrame(RefWindow* rw, int idx, bool renderAfter) {
    bool native = !rw->gifSrcFrames.empty();
    int cnt = GifFrameCount(rw);
    if (cnt == 0) return;
    if (idx < 0) idx = 0; if (idx >= cnt) idx = cnt - 1;
    rw->gifIdx = idx;
    int dw = rw->decodeW > 0 ? rw->decodeW : 0;
    if ((int)rw->gifBmpCache.size() == cnt && rw->gifBmpCache[idx] && rw->gifBmpCacheW[idx] == dw) {
        rw->imageBmp = rw->gifBmpCache[idx];
        rw->decodeW = dw;
    } else {
        if (native) {
            LoadImage(rw, dw);  // LoadImage 检测到 isGif && gifSrcFrames 非空时走内存帧解码
        } else {
            rw->imagePath = rw->gifFrames[idx];
            rw->wicBmpCache = nullptr; rw->wicBmpCacheW = 0;
            LoadImage(rw, dw);
        }
        if ((int)rw->gifBmpCache.size() != cnt) { rw->gifBmpCache.assign(cnt, nullptr); rw->gifBmpCacheW.assign(cnt, -1); }
        rw->gifBmpCache[idx] = rw->imageBmp;
        rw->gifBmpCacheW[idx] = rw->decodeW;
    }
    if (renderAfter) { RenderFrame(rw); rw->dirty = true; }
}
void GifTogglePlay(RefWindow* rw) {
    if (GifFrameCount(rw) <= 1) return;
    rw->gifPlaying = !rw->gifPlaying;
    if (rw->gifPlaying) { rw->gifAccumMs = 0; rw->gifLastTick = timeGetTime(); SetTimer(rw->hwnd, GIF_TIMER_ID, GIF_TICK_MS, nullptr); }
    else KillTimer(rw->hwnd, GIF_TIMER_ID);
    RenderFrame(rw); rw->dirty = true;
}
void GifGoTo(RefWindow* rw, int idx) {
    int cnt = GifFrameCount(rw);
    if (cnt == 0) return;
    if (idx < 0) idx = 0; if (idx >= cnt) idx = cnt - 1;
    LoadGifFrame(rw, idx, true);
    if (rw->gifPlaying) { rw->gifAccumMs = 0; rw->gifLastTick = timeGetTime(); }
}
GifGeom CalcGifGeom(RefWindow* rw) {
    GifGeom g;
    float btnArea = 5.f * GIF_BTN + 4.f * GIF_GAP;
    float avail = (float)rw->windowW - 2.f * GIF_BAR_PAD_X;
    if (avail < btnArea + GIF_COUNTER_W + 3.f * GIF_GAP + 30.f) return g;
    float trackW = avail - btnArea - GIF_COUNTER_W - 2.f * GIF_GAP;
    if (trackW < 30.f) trackW = 30.f;
    float content = btnArea + GIF_GAP + trackW + GIF_GAP + GIF_COUNTER_W;
    g.barW = content;
    g.barLeft = ((float)rw->windowW - content) * 0.5f; if (g.barLeft < 2.f) g.barLeft = 2.f;
    g.barTop = (float)rw->windowH - GIF_BAR_H - 6.f; if (g.barTop < 2.f) g.barTop = 2.f;
    float cy = g.barTop + GIF_BAR_H * 0.5f;
    float x = g.barLeft;
    for (int i = 0; i < 5; i++) { g.btn[i] = x; x += GIF_BTN + ((i < 4) ? GIF_GAP : 0.f); }
    x += GIF_GAP + 8.f; g.trackL = x; g.trackT = cy - GIF_TRACK_H * 0.5f;
    g.trackR = x + trackW; g.trackB = cy + GIF_TRACK_H * 0.5f; g.trackW = trackW;
    x = g.trackR + GIF_GAP; g.counterL = x; g.counterTop = g.barTop; g.counterW = GIF_COUNTER_W;
    g.valid = true; return g;
}
int HitGifBtn(RefWindow* rw, POINT pt) {
    if (!rw->isGif) return -1;
    GifGeom g = CalcGifGeom(rw); if (!g.valid) return -1;
    if (pt.y < (LONG)g.barTop || pt.y >= (LONG)(g.barTop + GIF_BAR_H)) return -1;
    for (int i = 0; i < 5; i++) if (pt.x >= (LONG)g.btn[i] && pt.x < (LONG)(g.btn[i] + GIF_BTN)) return i;
    return -1;
}
bool HitGifTrackRect(RefWindow* rw, POINT pt) {
    if (!rw->isGif) return false;
    GifGeom g = CalcGifGeom(rw); if (!g.valid) return false;
    return pt.x >= (LONG)(g.trackL - 2) && pt.x <= (LONG)(g.trackR + 2) &&
           pt.y >= (LONG)(g.trackT - GIF_TRACK_HIT_PAD) && pt.y <= (LONG)(g.trackB + GIF_TRACK_HIT_PAD);
}
void GifApplyTrackX(RefWindow* rw, float cx) {
    GifGeom g = CalcGifGeom(rw); if (!g.valid || g.trackW <= 0) return;
    float t = (cx - g.trackL) / g.trackW; if (t < 0) t = 0; if (t > 1) t = 1;
    int cnt = GifFrameCount(rw); if (cnt <= 0) return;
    int idx = (int)(t * (cnt - 1) + 0.5f); if (idx < 0) idx = 0; if (idx >= cnt) idx = cnt - 1;
    LoadGifFrame(rw, idx, true);
}
static void GifFillTri(ID2D1DCRenderTarget* rt, ID2D1SolidColorBrush* br, float x0, float y0, float x1, float y1, float x2, float y2) {
    ComPtr<ID2D1PathGeometry> geo; if (FAILED(g_d2dFactory->CreatePathGeometry(&geo)) || !geo) return;
    ComPtr<ID2D1GeometrySink> sink; if (FAILED(geo->Open(&sink)) || !sink) return;
    sink->BeginFigure(D2D1::Point2F(x0, y0), D2D1_FIGURE_BEGIN_FILLED);
    sink->AddLine(D2D1::Point2F(x1, y1)); sink->AddLine(D2D1::Point2F(x2, y2));
    sink->EndFigure(D2D1_FIGURE_END_CLOSED); sink->Close();
    rt->FillGeometry(geo.Get(), br);
}

void DrawLockIcon(ID2D1DCRenderTarget* rt, ID2D1SolidColorBrush* br, float cx, float cy) {
    float bodyL = cx - 5.f, bodyR = cx + 5.f, bodyT = cy - 1.f, bodyB = cy + 6.f;
    D2D1_ROUNDED_RECT body = D2D1::RoundedRect(D2D1::RectF(bodyL, bodyT, bodyR, bodyB), 1.5f, 1.5f);
    rt->FillRoundedRectangle(body, br);
    {
        ComPtr<ID2D1PathGeometry> shackle;
        if (SUCCEEDED(g_d2dFactory->CreatePathGeometry(&shackle)) && shackle) {
            ComPtr<ID2D1GeometrySink> sink;
            if (SUCCEEDED(shackle->Open(&sink)) && sink) {
                D2D1_ARC_SEGMENT arc = D2D1::ArcSegment(D2D1::Point2F(cx + 3.2f, cy - 1.f), D2D1::SizeF(3.2f, 3.2f), 0.f, D2D1_SWEEP_DIRECTION_CLOCKWISE, D2D1_ARC_SIZE_SMALL);
                sink->BeginFigure(D2D1::Point2F(cx - 3.2f, cy - 1.f), D2D1_FIGURE_BEGIN_HOLLOW);
                sink->AddArc(arc);
                sink->EndFigure(D2D1_FIGURE_END_OPEN);
                sink->Close();
                rt->DrawGeometry(shackle.Get(), br, 1.6f);
            }
        }
    }
    ComPtr<ID2D1SolidColorBrush> hole; rt->CreateSolidColorBrush(BTN_BG, &hole);
    if (hole) rt->FillEllipse(D2D1::Ellipse(D2D1::Point2F(cx, cy + 1.5f), 1.1f, 1.1f), hole.Get());
}

void DrawGifIcon(ID2D1DCRenderTarget* rt, ID2D1SolidColorBrush* br, float cx, float cy, int type) {
    switch (type) {
        case 0: rt->DrawLine(D2D1::Point2F(cx - 4.f, cy - 4.f), D2D1::Point2F(cx - 4.f, cy + 4.f), br, 1.5f);
            GifFillTri(rt, br, cx - 1.f, cy, cx + 4.f, cy - 4.f, cx + 4.f, cy + 4.f); break;
        case 1: GifFillTri(rt, br, cx + 3.f, cy - 4.f, cx - 3.f, cy, cx + 3.f, cy + 4.f); break;
        case 3: GifFillTri(rt, br, cx - 3.f, cy - 4.f, cx + 3.f, cy, cx - 3.f, cy + 4.f); break;
        case 4: GifFillTri(rt, br, cx - 4.f, cy - 4.f, cx + 1.f, cy, cx - 4.f, cy + 4.f);
            rt->DrawLine(D2D1::Point2F(cx + 4.f, cy - 4.f), D2D1::Point2F(cx + 4.f, cy + 4.f), br, 1.5f); break;
        case 5: GifFillTri(rt, br, cx - 4.f, cy - 4.f, cx + 5.f, cy, cx - 4.f, cy + 4.f); break;
        case 6: rt->FillRectangle(D2D1::RectF(cx - 3.5f, cy - 4.f, cx - 1.f, cy + 4.f), br);
            rt->FillRectangle(D2D1::RectF(cx + 1.f, cy - 4.f, cx + 3.5f, cy + 4.f), br); break;
    }
}
void DrawGifControls(RefWindow* rw) {
    if (!rw->isGif) return;
    GifGeom g = CalcGifGeom(rw); if (!g.valid) return;
    ComPtr<ID2D1SolidColorBrush> bg, trkPill, trkFl, ic;
    rw->rt->CreateSolidColorBrush(D2D1::ColorF(0, 0, 0, 0.5f), &bg);
    rw->rt->CreateSolidColorBrush(D2D1::ColorF(0, 0, 0, 0.45f), &trkPill);
    rw->rt->CreateSolidColorBrush(TRACK_FILLED, &trkFl);
    rw->rt->CreateSolidColorBrush(D2D1::ColorF(1, 1, 1, 1), &ic);
    float cy = g.barTop + GIF_BAR_H * 0.5f;
    for (int i = 0; i < 5; i++) {
        float cx = g.btn[i] + GIF_BTN * 0.5f;
        if (bg) rw->rt->FillEllipse(D2D1::Ellipse(D2D1::Point2F(cx, cy), GIF_BTN * 0.5f, GIF_BTN * 0.5f), bg.Get());
        int type = i; if (i == 2) type = rw->gifPlaying ? 6 : 5;
        if (ic) DrawGifIcon(rw->rt.Get(), ic.Get(), cx, cy, type);
    }
    if (trkPill) {
        D2D1_ROUNDED_RECT rr = D2D1::RoundedRect(D2D1::RectF(g.trackL - 4.f, g.trackT - 5.f, g.trackR + 4.f, g.trackB + 5.f), 7.f, 7.f);
        rw->rt->FillRoundedRectangle(rr, trkPill.Get());
    }
    int cnt = GifFrameCount(rw);
    float fl = (cnt > 1) ? g.trackL + ((float)rw->gifIdx / (float)(cnt - 1)) * g.trackW : g.trackL;
    if (trkFl) rw->rt->FillRectangle(D2D1::RectF(g.trackL, g.trackT, fl, g.trackB), trkFl.Get());
    if (g_dwrite && g_gifTextFmt && ic) {
        wchar_t buf[32]; swprintf(buf, 32, L"%d/%d", rw->gifIdx + 1, cnt);
        ComPtr<IDWriteTextLayout> tl;
        if (SUCCEEDED(g_dwrite->CreateTextLayout(buf, (UINT32)wcslen(buf), g_gifTextFmt.Get(), g.counterW, GIF_BAR_H, &tl)) && tl) {
            DWRITE_TEXT_METRICS m; tl->GetMetrics(&m);
            float pad = 6.f;
            float pillL = g.counterL + (g.counterW - m.width) * 0.5f - pad;
            float pillR = g.counterL + (g.counterW - m.width) * 0.5f + m.width + pad;
            if (trkPill) {
                D2D1_ROUNDED_RECT cr = D2D1::RoundedRect(D2D1::RectF(pillL, g.barTop + 1.f, pillR, g.barTop + GIF_BAR_H - 1.f), 7.f, 7.f);
                rw->rt->FillRoundedRectangle(cr, trkPill.Get());
            }
            float tx = g.counterL + (g.counterW - m.width) * 0.5f;
            float ty = g.barTop + (GIF_BAR_H - m.height) * 0.5f;
            rw->rt->DrawTextLayout(D2D1::Point2F(tx, ty), tl.Get(), ic.Get(), D2D1_DRAW_TEXT_OPTIONS_NONE);
        }
    }
}
int main() {
    wchar_t logPath[MAX_PATH]; GetEnvironmentVariableW(L"TEMP", logPath, MAX_PATH);
    wcscat_s(logPath, L"\\refboard_debug.log");
    g_log = _wfsopen(logPath, L"a", _SH_DENYNO);
    dbg(L"BUILD_20260812_FLIPPAN_FIX");
    int argc; wchar_t** argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    std::wstring imagePath = GetArg(argc, argv, L"--image");
    std::wstring manifestPath = GetArg(argc, argv, L"--manifest");
    std::wstring localeArg = GetArg(argc, argv, L"--locale");
    std::wstring xArg = GetArg(argc, argv, L"--x");
    std::wstring yArg = GetArg(argc, argv, L"--y");
    if (!xArg.empty()) g_startX = _wtoi(xArg.c_str());
    if (!yArg.empty()) g_startY = _wtoi(yArg.c_str());
    if (!localeArg.empty()) { char buf[16]={}; WideCharToMultiByte(CP_UTF8,0,localeArg.c_str(),-1,buf,16,nullptr,nullptr); g_locale = buf; }
    LocalFree(argv);
    if (imagePath.empty() && manifestPath.empty()) { if (g_log) fclose(g_log); return 1; }
    SetProcessDPIAware();
    timeBeginPeriod(1);
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    HINSTANCE hInst = GetModuleHandleW(nullptr);
    // Check for existing instance
    HWND existing = FindWindowW(L"PicRandRefBoard4", nullptr);
    if (existing) {
        const std::wstring& p = !manifestPath.empty() ? manifestPath : imagePath;
        DWORD pathBytes = (DWORD)((p.size() + 1) * sizeof(wchar_t));
        DWORD total = (DWORD)sizeof(CopyDataPayload) + pathBytes;
        std::vector<BYTE> buf(total);
        CopyDataPayload pl; pl.x = g_startX; pl.y = g_startY;
        memcpy(buf.data(), &pl, sizeof(pl));
        memcpy(buf.data() + sizeof(pl), p.c_str(), pathBytes);
        COPYDATASTRUCT cds;
        cds.dwData = !manifestPath.empty() ? 2 : 1;
        cds.cbData = total;
        cds.lpData = buf.data();
        SendMessageW(existing, WM_COPYDATA, 0, (LPARAM)&cds);
        CoUninitialize(); if (g_log) fclose(g_log); return 0;
    }
    hr = D2D1CreateFactory((D2D1_FACTORY_TYPE)0, __uuidof(ID2D1Factory1), nullptr, (void**)&g_d2dFactory);
    if (FAILED(hr)) { CoUninitialize(); if (g_log) fclose(g_log); return 1; }
    hr = CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, __uuidof(IWICImagingFactory), (void**)&g_wic);
    if (FAILED(hr)) { CoUninitialize(); if (g_log) fclose(g_log); return 1; }
    if (SUCCEEDED(DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory), (IUnknown**)&g_dwrite)) && g_dwrite) {
        g_dwrite->CreateTextFormat(L"Consolas", nullptr, DWRITE_FONT_WEIGHT_NORMAL, DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL, 11.f, L"", &g_gifTextFmt);
    }
    WNDCLASSEXW wc = {}; wc.cbSize = sizeof(WNDCLASSEXW); wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst; wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.lpszClassName = L"PicRandRefBoard4"; wc.style = CS_DBLCLKS;
    if (!RegisterClassExW(&wc)) { CoUninitialize(); if (g_log) fclose(g_log); return 1; }
    RefWindow* rw = (!manifestPath.empty()) ? CreateGifRefWindow(manifestPath) : CreateRefWindow(imagePath);
    if (!rw) { CoUninitialize(); if (g_log) fclose(g_log); return 1; }
    g_windows.push_back(rw);
    ShowWindow(rw->hwnd, SW_SHOW); RenderFrame(rw);
    MSG msg;
    while (g_running && GetMessageW(&msg, nullptr, 0, 0)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
    CleanupAll(); CoUninitialize();
    timeEndPeriod(1);
    dbg(L"=== RefBoardHost exited normally ==="); if (g_log) fclose(g_log);
    return 0;
}
