import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { toPng } from 'html-to-image';
import download from 'downloadjs';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { 
  Search, 
  TrendingUp, 
  Instagram, 
  RefreshCw, 
  Image as ImageIcon, 
  Share2, 
  AlertCircle,
  ChevronRight,
  Globe,
  Zap,
  Download,
  Copy,
  History,
  Megaphone,
  MessageCircle,
  X,
  Search as SearchIcon
} from 'lucide-react';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface NewsItem {
  title: string;
  graphicHeadline: string;
  graphicSubtext: string;
  socialCaption: string;
  category: string;
  sourceUrl: string;
  imageUrl?: string;
}

const THEMES: Record<number, { name: string; focus: string }> = {
  1: { name: "Market Monday", focus: "Weekly outlook: Forex volatility, Kenya’s digital economy, and tech stocks." },
  2: { name: "Local Innovation", focus: "Kenyan tech news: The new AI Bill, startup funding, and local infrastructure." },
  3: { name: "AI Breakthroughs", focus: "Trending AI News: New model releases (e.g., MiniMax M2.5) and hardware updates." },
  4: { name: "Creative Tech", focus: "Filmmaking trends, AI-generated visuals, and design tools." },
  5: { name: "AI & Security", focus: "Trending AI News: Ethics, data leaks (e.g., Meta’s recent agent leak), and safety." },
  6: { name: "Weekly Recap", focus: "The 'Top 5' stories you missed this week." },
  0: { name: "Future Scenarios", focus: "Predictions for the next 5 years and community Q&A/Polls." },
};

export default function App() {
  const [loading, setLoading] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasImageKey, setHasImageKey] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [history, setHistory] = useState<NewsItem[]>([]);
  const [isPromoMode, setIsPromoMode] = useState(false);
  const [templateType, setTemplateType] = useState<'standard' | 'breaking' | 'minimalist'>('standard');
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");

  const templateRef = useRef<HTMLDivElement>(null);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasImageKey(true);
    }
  };

  // Scour for trending news based on daily theme
  const scourNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const day = new Date().getDay();
      const theme = THEMES[day];
      
      // Re-initialize AI client to pick up latest key if available
      const currentAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      // Get history titles to avoid duplicates
      const historyTitles = history.map(h => h.title).join(", ");

      const response = await currentAi.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find the top 4 most trending news stories from the last 5 days for today's theme: ${theme.name}. Focus on: ${theme.focus}. 
        
        CRITICAL: Scour a diverse range of platforms including X (Twitter), LinkedIn, local Kenyan news outlets (e.g., Nation, Standard), and global tech blogs (e.g., TechCrunch, Rest of World). Ensure the sources are varied and not from just one site.
        
        For each story, provide:
        1. title: A standard news title for internal tracking.
        2. graphicHeadline: A very short (max 5 words), punchy, clickbaity headline for a graphic that captures the essence of the story AND fits the theme "${theme.name}". (e.g., if theme is Market Monday, use "SHILLING CRASH?" or "TECH STOCK SURGE").
        3. graphicSubtext: A single short sentence providing a hook that connects the news story to the theme "${theme.name}".
        4. socialCaption: A compelling, high-context social media caption (2-3 paragraphs). It MUST explain the "why" (the underlying cause or motivation) and the "how" (the mechanism or impact) of the story, specifically tying it back to today's theme: "${theme.name}". Use an engaging, raw, and authoritative tone suitable for a tech-savvy African audience. Include relevant insights and avoid repeating the graphic text.
        5. category: One word category.
        6. sourceUrl: The URL to the source.

        IMPORTANT: Do not include these already scoured stories: [${historyTitles}].
        Also, create a 5th item that is a promotional "Breaking News" style announcement for the "KaNai Raw" channel itself, marketing it as the #1 source for raw African tech and drama.
        Return as a JSON array of 5 objects.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
        },
      });

      const data = JSON.parse(response.text || "[]");
      setNews(data);
      setHistory(prev => [...data, ...prev].slice(0, 20)); // Keep last 20 in history
      if (data.length > 0) {
        handleSelectNews(data[0]);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch trending news. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    } finally {
      setCopying(false);
    }
  };

  const handleDownloadAll = async () => {
    if (history.length === 0) {
      alert("No news items in history to download.");
      return;
    }
    
    setDownloadingAll(true);
    const zip = new JSZip();
    const captions: string[] = [];
    
    try {
      const originalSelected = selectedNews;
      const currentAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

      console.log(`Starting bulk download for ${history.length} items...`);

      for (let i = 0; i < history.length; i++) {
        const item = { ...history[i] };
        console.log(`Processing item ${i + 1}/${history.length}: ${item.title}`);
        
        try {
          // 1. Ensure item has an image URL
          if (!item.imageUrl) {
            if (hasImageKey) {
              try {
                const response = await currentAi.models.generateContent({
                  model: "gemini-3.1-flash-image-preview",
                  contents: `Find a highly relevant, dramatic, and high-quality news photograph for: "${item.graphicHeadline}". Context: ${item.title}. Return direct image URL.`,
                  config: { tools: [{ googleSearch: { searchTypes: { imageSearch: {} } } }] },
                });
                const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
                if (chunks) {
                  const directImgChunk = chunks.find(c => c.web?.uri && !c.web.uri.startsWith('data:'));
                  if (directImgChunk) item.imageUrl = directImgChunk.web!.uri;
                }
              } catch (e) { console.error("Bulk image search failed", e); }
            }
            if (!item.imageUrl) {
              const keywords = item.graphicHeadline.replace(/[?!]/g, '').split(' ').slice(0, 5).join(',');
              item.imageUrl = `https://loremflickr.com/800/800/news,${encodeURIComponent(keywords)}`;
            }
          }

          captions.push(`--- NEWS ITEM ${i + 1}: ${item.title} ---\n\n${item.socialCaption}\n\nSource: ${item.sourceUrl}\n\n#KaNaiRaw #AfricanTech #News\n\n`);

          // 2. Set as selected and wait for React to update the DOM
          setSelectedNews(item);
          
          // Small delay for React to trigger re-render
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // 3. Wait for the image to actually load in the DOM
          await new Promise(resolve => {
            const checkImage = () => {
              const img = templateRef.current?.querySelector('img');
              if (img && img.complete) {
                console.log(`Image loaded for item ${i + 1}`);
                resolve(true);
              } else if (img) {
                img.onload = () => resolve(true);
                img.onerror = () => {
                  console.warn(`Image failed to load for item ${i + 1}, using fallback`);
                  resolve(true);
                };
              } else {
                setTimeout(checkImage, 100);
              }
            };
            checkImage();
            // Safety timeout
            setTimeout(resolve, 3000);
          });

          // 4. Capture
          if (templateRef.current) {
            // Add a tiny extra delay for fonts/styles to settle
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const dataUrl = await toPng(templateRef.current, { 
              cacheBust: true,
              pixelRatio: 2,
              backgroundColor: '#ffffff',
              width: 512,
              height: 512,
              style: {
                width: '512px',
                height: '512px',
                maxWidth: 'none',
                margin: '0',
                padding: '0',
              }
            });
            
            const base64Data = dataUrl.split(',')[1];
            const safeHeadline = item.graphicHeadline.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 20);
            zip.file(`news-${i + 1}-${safeHeadline}.png`, base64Data, { base64: true });
            console.log(`Captured item ${i + 1}`);
          }
        } catch (itemErr) {
          console.error(`Failed to process item ${i + 1}`, itemErr);
          // Continue to next item instead of failing whole bundle
        }
      }

      setSelectedNews(originalSelected);
      zip.file("captions.txt", captions.join("\n" + "=".repeat(50) + "\n\n"));
      
      console.log("Generating ZIP file...");
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `kanai-raw-bundle-${new Date().toISOString().split('T')[0]}.zip`);
      
      alert("All news items processed and downloaded as ZIP!");
    } catch (err) {
      console.error("Failed to download all", err);
      setError("Failed to generate bundle. Please try again.");
    } finally {
      setDownloadingAll(false);
    }
  };

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasImageKey(hasKey);
      }
    };
    checkKey();
    scourNews(); // Initial scour on start
  }, []);

  const handleUpdateImageUrl = () => {
    if (imageUrlInput.trim() && selectedNews) {
      setSelectedNews({ ...selectedNews, imageUrl: imageUrlInput.trim() });
      setImageUrlInput("");
    }
  };

  const handleSelectNews = async (item: NewsItem) => {
    setSelectedNews(item);
    if (!item.imageUrl) {
      if (!hasImageKey) {
        // Fallback to picsum if no key selected yet
        setSelectedNews(prev => prev ? { ...prev, imageUrl: `https://picsum.photos/seed/${encodeURIComponent(item.title)}/800/600` } : null);
        return;
      }

      setLoading(true);
      try {
        // Re-initialize AI client right before call for latest key
        const currentAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
        const response = await currentAi.models.generateContent({
          model: "gemini-3.1-flash-image-preview",
          contents: `Find a highly relevant, dramatic, and high-quality news photograph or representative image that directly illustrates this headline: "${item.graphicHeadline}". 
          The image must be a direct visual representation of the subject mentioned in the headline (Context: ${item.title}). 
          Prioritize images that match the "vibe" and specific keywords of the headline.
          Return the direct image URL.`,
          config: {
            tools: [{ googleSearch: { searchTypes: { imageSearch: {} } } }],
          },
        });

        // Extract image URL from grounding metadata or parts
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        let imgUrl = "";
        if (chunks) {
          // Look for direct image links first, excluding data URIs
          const directImgChunk = chunks.find(c => 
            c.web?.uri && 
            !c.web.uri.startsWith('data:') &&
            (c.web.uri.match(/\.(jpg|jpeg|png|webp|avif)$/i) || c.web.uri.includes('img'))
          );
          
          if (directImgChunk) {
            imgUrl = directImgChunk.web!.uri;
          } else {
            // If no direct link, try any URI that looks like an image host and is not a data URI
            const likelyImgChunk = chunks.find(c => 
              c.web?.uri && 
              !c.web.uri.startsWith('data:') &&
              (c.web.uri.includes('images') || c.web.uri.includes('photo') || c.web.uri.includes('media'))
            );
            if (likelyImgChunk) imgUrl = likelyImgChunk.web!.uri;
          }
        }

        // Fallback if no direct image URL found in grounding
        if (!imgUrl) {
          // Use the graphic headline as the primary keyword for fallback
          const keywords = item.graphicHeadline.replace(/[?!]/g, '').split(' ').slice(0, 5).join(',');
          imgUrl = `https://loremflickr.com/800/800/news,${encodeURIComponent(keywords)}`;
        }

        console.log("Setting image URL for news:", imgUrl);
        setSelectedNews(prev => prev ? { ...prev, imageUrl: imgUrl } : null);
      } catch (err: any) {
        console.error("Image search failed", err);
        if (err.message?.includes("PERMISSION_DENIED") || err.message?.includes("Requested entity was not found")) {
          setHasImageKey(false);
          setError("Image search requires a paid API key. Please select one to enable high-quality visuals.");
        }
        setSelectedNews(prev => prev ? { ...prev, imageUrl: `https://picsum.photos/seed/${encodeURIComponent(item.title)}/800/600` } : null);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDownloadGraphic = async () => {
    if (!templateRef.current || !selectedNews) return;
    try {
      // Copy caption to clipboard
      const caption = `${selectedNews.socialCaption}\n\n#KaNaiRaw #AfricanTech #News`;
      await navigator.clipboard.writeText(caption);

      // Force a consistent width/height during capture to prevent truncation on small screens
      const dataUrl = await toPng(templateRef.current, { 
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: 512,
        height: 512,
        style: {
          width: '512px',
          height: '512px',
          maxWidth: 'none',
          margin: '0',
          padding: '0',
        }
      });
      download(dataUrl, `kanai-raw-${Date.now()}.png`);
      alert("Graphic downloaded and caption copied to clipboard!");
    } catch (err) {
      console.error('Failed to download graphic', err);
      setError("Failed to generate download. Please try again.");
    }
  };

  const handleShare = async (platform?: 'whatsapp') => {
    if (!templateRef.current || !selectedNews) return;
    
    setSharing(true);
    try {
      const dataUrl = await toPng(templateRef.current, { 
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: 512,
        height: 512,
        style: {
          width: '512px',
          height: '512px',
          maxWidth: 'none',
          margin: '0',
          padding: '0',
        }
      });

      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'kanai-raw.png', { type: 'image/png' });
      const caption = `${selectedNews.socialCaption}\n\n#KaNaiRaw #AfricanTech #News`;

      if (platform === 'whatsapp') {
        const encodedText = encodeURIComponent(caption);
        window.open(`https://wa.me/?text=${encodedText}`, '_blank');
        // Note: WhatsApp API doesn't support direct image sharing via URL easily without a hosted image
        // So we just share the text and the user can paste the downloaded image
        alert("Caption shared to WhatsApp! Please download the graphic and attach it manually.");
      } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'KaNai Raw News',
          text: caption,
        });
      } else {
        // Fallback: Just download and copy caption
        handleDownloadGraphic();
        copyToClipboard(caption);
        alert("Sharing not supported on this browser. Graphic downloaded and caption copied to clipboard!");
      }
    } catch (err) {
      console.error('Sharing failed', err);
      setError("Failed to share. Please try downloading instead.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black overflow-x-hidden">
      <div className="grain" />
      
      {/* Navigation */}
      <nav className="border-b-2 border-white px-6 py-6 flex justify-between items-center sticky top-0 z-50 bg-black">
        <div className="flex items-center gap-4">
          <div className="flex flex-col -space-y-2">
            <span className="text-4xl font-serif font-black tracking-tighter uppercase">KaNai</span>
            <span className="text-2xl font-sans font-light tracking-[0.2em] uppercase opacity-80">Raw</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {!hasImageKey && (
            <button 
              onClick={handleSelectKey}
              className="hidden md:flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-white/40 hover:text-white transition-colors"
            >
              <AlertCircle className="w-3 h-3" />
              Unlock AI Visuals
            </button>
          )}
          <button 
            onClick={scourNews}
            disabled={loading}
            className="p-2 border border-white/20 hover:bg-white hover:text-black transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left: History & Schedule */}
        <div className="lg:col-span-4 space-y-10">
          {/* History Log */}
          <div className="border border-white/20 p-8 bg-white/5 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-white/20 transition-colors" />
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-white/40 mb-1">Session History</h2>
                <p className="text-2xl font-serif italic font-bold">
                  RAW LOGS
                </p>
              </div>
              <History className="w-6 h-6 text-white/40" />
            </div>
            
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {history.length === 0 ? (
                <p className="text-[10px] font-mono uppercase opacity-40">No logs yet...</p>
              ) : (
                history.map((item, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleSelectNews(item)}
                    className="p-3 border border-white/5 hover:border-white/20 cursor-pointer transition-all group/item"
                  >
                    <p className="text-[10px] font-serif font-bold truncate group-hover/item:text-white transition-colors">{item.title}</p>
                    <p className="text-[8px] font-mono opacity-40 uppercase">{item.category}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Weekly Schedule */}
          <div className="space-y-6">
            <h2 className="text-xs font-mono uppercase tracking-[0.4em] text-white/40 flex items-center gap-3">
              <TrendingUp className="w-4 h-4" />
              Weekly Transmission Protocol
            </h2>
            <div className="space-y-2">
              {[
                { day: "MON", theme: "Market Monday", focus: "Forex & Tech Stocks" },
                { day: "TUE", theme: "Local Innovation", focus: "Kenyan AI & Startups" },
                { day: "WED", theme: "AI Breakthroughs", focus: "New Model Releases" },
                { day: "THU", theme: "Creative Tech", focus: "Design & AI Visuals" },
                { day: "FRI", theme: "AI & Security", focus: "Ethics & Data Leaks" },
                { day: "SAT", theme: "Weekly Recap", focus: "Top 5 Stories" },
                { day: "SUN", theme: "Future Scenarios", focus: "5-Year Predictions" },
              ].map((item, idx) => (
                <div key={item.day} className={`flex items-center gap-4 p-4 border ${new Date().getDay() === (idx + 1) % 7 ? 'border-white bg-white/10' : 'border-white/5'} transition-all`}>
                  <span className="text-[10px] font-mono font-bold w-10">{item.day}</span>
                  <div className="flex-1">
                    <p className="text-sm font-serif font-bold italic">{item.theme}</p>
                    <p className="text-[9px] font-mono opacity-40 uppercase">{item.focus}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Manual Scour & Preview */}
        <div className="lg:col-span-8 space-y-12">
          {/* Manual Scour Control */}
          <div className="flex items-center justify-between border-b border-white/10 pb-8">
            <div className="space-y-1">
              <h2 className="text-4xl font-serif font-black italic tracking-tighter">MANUAL OVERRIDE</h2>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">Scour the web for raw data</p>
            </div>
            <button 
              onClick={scourNews}
              disabled={loading}
              className="flex items-center gap-4 bg-white text-black px-8 py-4 font-black uppercase tracking-tighter hover:bg-white/90 transition-all disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              {loading ? 'Scouring...' : 'Scour Now'}
            </button>
          </div>

          {/* News Feed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {news.map((item, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => handleSelectNews(item)}
                className={`group cursor-pointer p-8 border ${selectedNews?.title === item.title ? 'border-white bg-white/5' : 'border-white/10'} hover:border-white transition-all relative`}
              >
                <div className="flex justify-between items-start mb-6">
                  <span className="text-4xl font-serif italic font-black opacity-10 group-hover:opacity-20 transition-opacity">
                    0{idx + 1}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest italic">
                    {item.category}
                  </span>
                </div>
                <h3 className="text-2xl font-serif font-medium leading-tight tracking-tight">
                  {item.title}
                </h3>
                {selectedNews?.title === item.title && (
                  <motion.div 
                    layoutId="active-bar"
                    className="h-0.5 w-12 bg-white mt-4" 
                  />
                )}
              </motion.div>
            ))}
          </div>

          {/* Preview & Template */}
          {selectedNews && (
            <div className="space-y-12 pt-12 border-t border-white/10">
              {/* Template Preview - Brutalist Style */}
              <div className={`relative aspect-square max-w-lg mx-auto bg-white overflow-hidden border-[12px] shadow-[20px_20px_0px_rgba(255,255,255,0.1)] ${templateType === 'breaking' ? 'border-red-600' : (templateType === 'minimalist' ? 'border-black' : 'border-white')}`} id="template-preview" ref={templateRef}>
                {loading && !selectedNews?.imageUrl ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
                    <div className="text-center">
                      <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-6 text-white" />
                      <p className="text-xs font-mono uppercase tracking-[0.5em]">Processing Raw Data</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {templateType !== 'minimalist' && (
                      <img 
                        src={selectedNews.imageUrl || 'https://images.unsplash.com/photo-1501139083538-0139583c060f?q=80&w=800&auto=format&fit=crop'} 
                        alt="News" 
                        className="absolute inset-0 w-full h-full object-cover grayscale contrast-125 brightness-75"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    
                    {templateType === 'minimalist' && (
                      <div className="absolute inset-0 bg-white" />
                    )}

                    {/* Distressed Overlays */}
                    {templateType !== 'minimalist' && (
                      <>
                        <div className="absolute inset-0 bg-black/20 mix-blend-overlay" />
                        <div className="absolute inset-0 border-[1px] border-white/20 m-4" />
                      </>
                    )}
                    
                    {/* Header Info */}
                    <div className="absolute top-10 left-10 right-10 flex justify-between items-start z-20">
                      <div className="flex flex-col">
                        <div className={`flex flex-col -space-y-1 ${templateType === 'minimalist' ? '' : 'mix-blend-difference'}`}>
                          <span className={`text-2xl font-serif font-black tracking-tighter uppercase ${templateType === 'minimalist' ? 'text-black' : 'text-white'}`}>KaNai</span>
                          <span className={`text-[10px] font-sans font-light tracking-[0.2em] uppercase opacity-80 ${templateType === 'minimalist' ? 'text-black' : 'text-white'}`}>
                            {isPromoMode ? 'Official' : 'Raw'}
                          </span>
                        </div>
                        {templateType === 'breaking' && (
                          <div className="mt-2 bg-red-600 text-white px-3 py-1 text-[16px] font-black uppercase tracking-tighter italic inline-block w-fit">
                            BREAKING NEWS
                          </div>
                        )}
                      </div>
                      <div className={`${templateType === 'minimalist' ? 'text-black border-black/40' : 'text-white border-white/40 mix-blend-difference'} font-mono text-[10px] tracking-widest border px-2 py-1`}>
                        {isPromoMode ? 'PROMO' : selectedNews.category.toUpperCase()}
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className={`absolute bottom-0 left-0 right-0 p-10 ${templateType === 'minimalist' ? 'bg-transparent text-black' : 'bg-black/80 text-white'}`}>
                      <motion.div
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="space-y-4"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`${templateType === 'minimalist' ? 'bg-black text-white' : 'bg-white text-black'} px-2 py-0.5 text-[8px] font-black tracking-widest uppercase`}>
                            {selectedNews.category}
                          </div>
                          <div className={`h-[1px] flex-1 ${templateType === 'minimalist' ? 'bg-black/10' : 'bg-white/20'}`} />
                        </div>
                        <h1 className={`text-4xl font-serif font-black leading-[0.9] tracking-tighter uppercase italic break-words ${templateType === 'minimalist' ? 'text-black' : 'text-white'}`}>
                          {isPromoMode ? 'JOIN THE RAW REVOLUTION' : selectedNews.graphicHeadline}
                        </h1>
                        <div className="flex justify-between items-end gap-8">
                          <p className={`text-[10px] font-sans font-light leading-relaxed max-w-[70%] ${templateType === 'minimalist' ? 'text-black/70' : 'opacity-80'}`}>
                            {isPromoMode 
                              ? 'The #1 source for African tech, drama, and raw data. Follow KaNai Raw for the latest breakthroughs and market volatility.' 
                              : selectedNews.graphicSubtext}
                          </p>
                          <div className={`text-[8px] font-mono uppercase tracking-widest ${templateType === 'minimalist' ? 'text-black/40 border-black/10' : 'opacity-40 border-white/20'} border-l pl-4`}>
                            {isPromoMode 
                              ? 'FOLLOW US' 
                              : `${(() => {
                                  try {
                                    const domain = new URL(selectedNews.sourceUrl).hostname.replace('www.', '');
                                    return domain.split('.')[0];
                                  } catch {
                                    return 'Signal';
                                  }
                                })()} / ${new Date().toLocaleDateString()}`}
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-6 justify-center">
                <div className="w-full flex flex-wrap justify-center gap-4 mb-4">
                  <button 
                    onClick={() => setIsPromoMode(!isPromoMode)}
                    className={`flex items-center gap-2 px-4 py-2 border text-[10px] font-mono uppercase tracking-widest transition-all ${isPromoMode ? 'bg-white text-black border-white' : 'border-white/20 text-white/60 hover:border-white'}`}
                  >
                    <Megaphone className="w-3 h-3" />
                    {isPromoMode ? 'Promo: ON' : 'Promo: OFF'}
                  </button>
                  <button 
                    onClick={() => {
                      if (templateType === 'standard') setTemplateType('breaking');
                      else if (templateType === 'breaking') setTemplateType('minimalist');
                      else setTemplateType('standard');
                    }}
                    className={`flex items-center gap-2 px-4 py-2 border text-[10px] font-mono uppercase tracking-widest transition-all ${templateType === 'breaking' ? 'bg-red-600 text-white border-red-600' : (templateType === 'minimalist' ? 'bg-black text-white border-black' : 'border-white/20 text-white/60 hover:border-white')}`}
                  >
                    <Zap className="w-3 h-3" />
                    {templateType === 'breaking' ? 'Template: BREAKING' : (templateType === 'minimalist' ? 'Template: MINIMALIST' : 'Template: STANDARD')}
                  </button>
                  <button 
                    onClick={() => {
                      const query = encodeURIComponent(selectedNews.title);
                      window.open(`https://www.google.com/search?q=${query}&tbm=isch`, '_blank');
                    }}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 border border-white/20 text-[10px] font-mono uppercase tracking-widest text-white/60 hover:border-white hover:text-white transition-all disabled:opacity-50"
                  >
                    <SearchIcon className="w-3 h-3" />
                    Search Image
                  </button>
                  <button 
                    onClick={() => copyToClipboard(`${selectedNews.socialCaption}\n\n#KaNaiRaw #AfricanTech #News`)}
                    disabled={copying}
                    className="flex items-center gap-2 px-4 py-2 border border-white/20 text-[10px] font-mono uppercase tracking-widest text-white/60 hover:border-white hover:text-white transition-all disabled:opacity-50"
                  >
                    {copying ? <RefreshCw className="w-3 h-3 animate-spin" /> : (copied ? <Zap className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />)}
                    {copying ? 'Copying...' : (copied ? 'Copied!' : 'Copy Caption')}
                  </button>
                </div>
                
                <div className="w-full flex justify-center mb-4">
                  <button 
                    onClick={handleDownloadAll}
                    disabled={downloadingAll || loading}
                    className="flex items-center gap-3 border border-white/20 text-white/60 px-10 py-4 font-bold uppercase tracking-tighter hover:bg-white hover:text-black transition-all disabled:opacity-50"
                  >
                    {downloadingAll ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    {downloadingAll ? 'Bundling All News...' : 'Download All Scoured News (ZIP)'}
                  </button>
                </div>

                <div className="w-full flex justify-center mb-4 px-4">
                  <div className="flex w-full max-w-lg gap-2">
                    <input 
                      type="text"
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="Paste Image URL here..."
                      className="flex-1 bg-white/5 border border-white/10 px-4 py-2 text-[10px] font-mono focus:border-white/40 outline-none transition-all"
                    />
                    <button 
                      onClick={handleUpdateImageUrl}
                      className="px-4 py-2 bg-white text-black text-[10px] font-mono uppercase tracking-widest hover:bg-white/90 transition-all"
                    >
                      Update
                    </button>
                  </div>
                </div>
                
                {!hasImageKey && (
                  <button 
                    onClick={handleSelectKey}
                    className="w-full max-w-lg mb-4 border border-white/20 p-4 text-xs font-mono uppercase tracking-widest hover:bg-white hover:text-black transition-all flex items-center justify-center gap-3"
                  >
                    <Zap className="w-4 h-4" />
                    Enable High-Quality AI Visuals (Requires API Key)
                  </button>
                )}
                <button 
                  className="group relative flex items-center gap-3 bg-white text-black px-10 py-5 font-black uppercase tracking-tighter hover:bg-white/90 transition-all disabled:opacity-50"
                  disabled={loading || sharing || downloadingAll}
                  onClick={() => handleShare()}
                >
                  {sharing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                  {sharing ? 'Sharing...' : 'Share to Socials'}
                  <div className="absolute -bottom-1 -right-1 w-full h-full border border-white -z-10 group-hover:translate-x-1 group-hover:translate-y-1 transition-transform" />
                </button>
                <button 
                  className="flex items-center gap-3 border-2 border-emerald-500 text-emerald-500 px-10 py-5 font-bold uppercase tracking-tighter hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50"
                  disabled={loading || sharing || downloadingAll}
                  onClick={() => handleShare('whatsapp')}
                >
                  {sharing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                  WhatsApp
                </button>
                <button 
                  className="flex items-center gap-3 border-2 border-white text-white px-10 py-5 font-bold uppercase tracking-tighter hover:bg-white hover:text-black transition-all disabled:opacity-50"
                  disabled={loading || downloadingAll}
                  onClick={handleDownloadGraphic}
                >
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  Download Graphic
                </button>
                <button 
                  className="flex items-center gap-3 border border-white/40 text-white px-10 py-5 font-bold uppercase tracking-tighter hover:bg-white hover:text-black transition-all"
                  onClick={() => window.open(selectedNews.sourceUrl, '_blank')}
                >
                  <Globe className="w-5 h-5" />
                  Source Trace
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {error && (
        <div className="fixed bottom-8 right-8 bg-white text-black px-8 py-4 font-black uppercase tracking-tighter flex items-center gap-4 shadow-[10px_10px_0px_rgba(255,255,255,0.1)]">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Global Bundling Overlay */}
      <AnimatePresence>
        {downloadingAll && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center backdrop-blur-xl"
          >
            <div className="text-center">
              <RefreshCw className="w-16 h-16 animate-spin mx-auto mb-8 text-white" />
              <h2 className="text-4xl font-serif italic font-black tracking-widest uppercase mb-4">Bundling All News</h2>
              <p className="text-xs font-mono opacity-40 uppercase tracking-[0.5em]">Generating unique graphics for your session history...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
