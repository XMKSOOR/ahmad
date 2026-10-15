import React, { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import * as XLSX from 'xlsx';
import { InvoiceItem, parseZatcaQR } from './utils/zatca';
import { fixReversedArabic, reverseString } from './utils/arabicFixer';

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>('upload');
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [reportTitle, setReportTitle] = useState<string>('سجل المشتريات الضريبية');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraSnapInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const clearMessages = useCallback(() => {
    setStatusMessage('');
    setErrorMessage('');
  }, []);

  const stopCamera = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setHasTorch(false);
    setIsTorchOn(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleTabSwitch = (tab: 'upload' | 'camera') => {
    if (tab !== 'camera') {
      stopCamera();
    }
    clearMessages();
    setActiveTab(tab);
  };

  const addDecodedInvoice = useCallback((text: string) => {
    const result = parseZatcaQR(text);
    if (!result.success || !result.data) {
      setErrorMessage(result.error || 'الرمز المقروء لا يطابق تنسيق فواتير زكاة وصدقة/ZATCA القياسي.');
      return;
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(60);
      } catch {
        // ignore
      }
    }

    const newInvoice: InvoiceItem = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      ...result.data,
    };

    setInvoices((prev) => [...prev, newInvoice]);
    setStatusMessage('تمت إضافة الفاتورة بنجاح!');
  }, []);

  const processImageFile = useCallback((file: File) => {
    clearMessages();
    setStatusMessage('جارٍ تحليل الصورة...');

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setStatusMessage('');
        setErrorMessage('تعذّر تهيئة بيئة معالجة الصورة.');
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      setStatusMessage('');
      if (code && code.data) {
        addDecodedInvoice(code.data);
      } else {
        setErrorMessage('لم يتم العثور على رمز QR واضح. تأكد من وضوح الصورة وتوسط الرمز.');
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setStatusMessage('');
      setErrorMessage('تعذّر قراءة ملف الصورة.');
    };

    img.src = objectUrl;
  }, [addDecodedInvoice, clearMessages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file);
    } else if (file) {
      setErrorMessage('يرجى اختيار ملف صورة صالح.');
    }
  };

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code && code.data) {
          setStatusMessage('');
          addDecodedInvoice(code.data);
          stopCamera();
          return;
        }
      }
    }
    rafIdRef.current = requestAnimationFrame(scanFrame);
  }, [addDecodedInvoice, stopCamera]);

  const toggleCamera = async () => {
    if (isCameraActive) {
      stopCamera();
      return;
    }

    clearMessages();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage(
        'المتصفح لا يدعم الوصول المباشر للكاميرا عبر الويب، يمكنك استخدام خيار "التقاط فوري بالكاميرا" أدناه.'
      );
      return;
    }

    try {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      }

      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as { torch?: boolean };
        if (capabilities.torch) {
          setHasTorch(true);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }

      setIsCameraActive(true);
      setStatusMessage('وجّه الكاميرا نحو رمز الـ QR داخل المربع...');
      rafIdRef.current = requestAnimationFrame(scanFrame);
    } catch (err: unknown) {
      console.warn('Camera stream error:', err);
      const isAppleDevice = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
      setErrorMessage(
        isAppleDevice
          ? 'تعذّر تشغيل الكاميرا في سفاري. يرجى التأكد من السماح للكاميرا في إعدادات Safari، أو استخدام زر "التقاط فوري بالكاميرا".'
          : 'تعذّر تشغيل الكاميرا. تأكد من منح الصلاحيات في المتصفح، أو استخدم زر "التقاط فوري بالكاميرا".'
      );
    }
  };

  const toggleTorch = async () => {
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      try {
        const nextState = !isTorchOn;
        await (videoTrack as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setIsTorchOn(nextState);
      } catch {
        // torch not supported
      }
    }
  };

  const handleInvoiceChange = (id: string, field: keyof InvoiceItem, value: string) => {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === id) {
          return { ...inv, [field]: value };
        }
        return inv;
      })
    );
  };

  const handleDeleteInvoice = (id: string) => {
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
  };

  // Flip / reverse seller name if inverted by POS printer software
  const handleToggleReverseSeller = (id: string) => {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id === id) {
          const words = inv.seller.split(/\s+/);
          // Check if words should be reversed individually or whole string
          const flippedWords = words.map((w) => reverseString(w)).join(' ');
          return { ...inv, seller: flippedWords };
        }
        return inv;
      })
    );
  };

  // Fix all inverted Arabic seller names
  const handleFixAllArabic = () => {
    setInvoices((prev) =>
      prev.map((inv) => ({
        ...inv,
        seller: fixReversedArabic(inv.seller),
      }))
    );
    setStatusMessage('تم فحص وتصحيح النصوص العربية بنجاح!');
  };

  const totalSum = invoices.reduce((sum, item) => {
    const val = typeof item.total === 'number' ? item.total : parseFloat(String(item.total));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const handleDownloadExcel = () => {
    if (!invoices.length) return;
    const title = reportTitle.trim() || 'سجل المشتريات الضريبية';
    
    // Header & Content
    const aoa: (string | number)[][] = [
      [title],
      ['م', 'اسم المورد', 'الرقم الضريبي', 'رقم الفاتورة', 'التاريخ', 'المبلغ الخاضع', 'الضريبة 15%', 'الإجمالي'],
    ];

    invoices.forEach((inv, index) => {
      const taxableNum = typeof inv.taxable === 'number' ? inv.taxable : parseFloat(String(inv.taxable));
      const vatNum = typeof inv.vat === 'number' ? inv.vat : parseFloat(String(inv.vat));
      const totalNum = typeof inv.total === 'number' ? inv.total : parseFloat(String(inv.total));

      aoa.push([
        index + 1,
        inv.seller,
        inv.vatNumber,
        inv.invoiceNumber,
        inv.date,
        isNaN(taxableNum) ? inv.taxable : taxableNum,
        isNaN(vatNum) ? inv.vat : vatNum,
        isNaN(totalNum) ? inv.total : totalNum,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // CRITICAL: Set worksheet direction to Right-to-Left (RTL) so Arabic displays correctly in Excel
    ws['!views'] = [{ RTL: true }];

    // Column widths formatted with generous padding to prevent squishing Arabic words
    ws['!cols'] = [
      { wch: 6 },  // م
      { wch: 38 }, // اسم المورد
      { wch: 22 }, // الرقم الضريبي
      { wch: 20 }, // رقم الفاتورة
      { wch: 24 }, // التاريخ
      { wch: 18 }, // المبلغ الخاضع
      { wch: 18 }, // الضريبة 15%
      { wch: 18 }, // الإجمالي
    ];

    // Merge title across columns
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    ];

    const wb = XLSX.utils.book_new();
    wb.Workbook = {
      Views: [{ RTL: true }],
    };

    XLSX.utils.book_append_sheet(wb, ws, 'المشتريات');
    XLSX.writeFile(wb, 'ZATCA_Invoices.xlsx');
  };

  return (
    <main>
      <header>
        <h1>قارئ رمز QR للفواتير السعودية</h1>
        <p>امسح رموز QR من الفواتير الضريبية (صورة أو كاميرا) ونزّلها كملف إكسل معتمد.</p>
      </header>

      <div className="tabs" role="tablist">
        <button
          type="button"
          className="tab"
          id="tab-upload"
          aria-selected={activeTab === 'upload'}
          onClick={() => handleTabSwitch('upload')}
        >
          رفع صورة
        </button>
        <button
          type="button"
          className="tab"
          id="tab-camera"
          aria-selected={activeTab === 'camera'}
          onClick={() => handleTabSwitch('camera')}
        >
          المسح بالكاميرا
        </button>
      </div>

      {/* Upload Image Panel */}
      <section className={`panel ${activeTab === 'upload' ? 'active' : ''}`} id="panel-upload">
        <div
          className={`dropzone ${isDragging ? 'dragover' : ''}`}
          id="dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
        >
          <p>📁 اضغط هنا لاختيار صورة الـ QR من جهازك</p>
          <p style={{ fontSize: '0.8rem', marginTop: '4px', opacity: 0.8 }}>
            (أو اسحب وأفلت صورة الفاتورة هنا)
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          id="fileInput"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </section>

      {/* Camera Scanner Panel */}
      <section className={`panel ${activeTab === 'camera' ? 'active' : ''}`} id="panel-camera">
        <div className="cam-wrap">
          <div className="cam-container">
            <video
              ref={videoRef}
              id="video"
              playsInline
              muted
              autoPlay
            ></video>
            {isCameraActive && <div className="cam-target-box"></div>}
          </div>

          <div className="cam-controls">
            <button
              type="button"
              className="primary"
              id="camBtn"
              onClick={toggleCamera}
            >
              {isCameraActive ? '⏹ إيقاف الكاميرا' : '📷 تشغيل الكاميرا المباشرة'}
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => cameraSnapInputRef.current?.click()}
              title="التقاط صورة سريعة عبر تطبيق الكاميرا الرسمي في الهاتف"
            >
              📸 التقاط فوري بالكاميرا
            </button>

            {hasTorch && isCameraActive && (
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: '0 0 auto', minWidth: 'auto', padding: '10px 16px' }}
                onClick={toggleTorch}
                title="تشغيل/إطفاء فلاش الكاميرا"
              >
                {isTorchOn ? '🔦 إطفاء الفلاش' : '💡 تشغيل الفلاش'}
              </button>
            )}
          </div>

          <input
            ref={cameraSnapInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </section>

      {statusMessage && <p className="status" id="status">{statusMessage}</p>}
      {errorMessage && (
        <div id="errorBox">
          <div className="error">{errorMessage}</div>
        </div>
      )}

      {/* Invoice Report Section */}
      <section className="report">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '10px', marginBottom: '12px' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="reportTitle">عنوان التقرير</label>
            <input
              type="text"
              id="reportTitle"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
            />
          </div>

          {invoices.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '8px 12px', fontSize: '0.82rem', flex: '0 0 auto' }}
              onClick={handleFixAllArabic}
              title="تصحيح أي نصوص عربية مقلوبة بسبب الطابعات الحرارية"
            >
              🔄 تصحيح النصوص المقلوبة
            </button>
          )}
        </div>

        {invoices.length > 0 ? (
          <div className="table-wrap" id="invoicesWrap">
            <table>
              <thead>
                <tr>
                  <th>م</th>
                  <th>اسم المورد</th>
                  <th>الرقم الضريبي</th>
                  <th>رقم الفاتورة</th>
                  <th>التاريخ</th>
                  <th>المبلغ الخاضع</th>
                  <th>الضريبة 15%</th>
                  <th>الإجمالي</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="invoicesBody">
                {invoices.map((inv, idx) => (
                  <tr key={inv.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          style={{ textAlign: 'right' }}
                          value={inv.seller}
                          onChange={(e) => handleInvoiceChange(inv.id, 'seller', e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleToggleReverseSeller(inv.id)}
                          title="عكس / تعديل اتجاه الحروف إذا ظهرت مقلوبة"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            opacity: 0.6,
                            padding: '2px 4px',
                          }}
                        >
                          🔄
                        </button>
                      </div>
                    </td>
                    <td>
                      <input
                        dir="ltr"
                        value={inv.vatNumber}
                        onChange={(e) => handleInvoiceChange(inv.id, 'vatNumber', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        dir="ltr"
                        placeholder="أدخل الرقم"
                        value={inv.invoiceNumber}
                        onChange={(e) => handleInvoiceChange(inv.id, 'invoiceNumber', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        dir="ltr"
                        value={inv.date}
                        onChange={(e) => handleInvoiceChange(inv.id, 'date', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        dir="ltr"
                        value={inv.taxable}
                        onChange={(e) => handleInvoiceChange(inv.id, 'taxable', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        dir="ltr"
                        value={inv.vat}
                        onChange={(e) => handleInvoiceChange(inv.id, 'vat', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        dir="ltr"
                        value={inv.total}
                        onChange={(e) => handleInvoiceChange(inv.id, 'total', e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="del"
                        onClick={() => handleDeleteInvoice(inv.id)}
                        aria-label="حذف الفاتورة"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state" id="emptyState">
            لم تُضف أي فاتورة بعد.
          </p>
        )}

        <div className="summary-row">
          <span id="summary">
            {invoices.length > 0
              ? `عدد الفواتير: ${invoices.length} — الإجمالي: ${totalSum.toFixed(2)} ر.س`
              : ''}
          </span>
          <button
            type="button"
            className="primary"
            id="downloadBtn"
            disabled={invoices.length === 0}
            style={{ width: 'auto', marginTop: 0 }}
            onClick={handleDownloadExcel}
          >
            ⬇️ تنزيل ملف إكسل
          </button>
        </div>
      </section>

      <canvas ref={canvasRef} id="canvas" style={{ display: 'none' }}></canvas>
    </main>
  );
}
