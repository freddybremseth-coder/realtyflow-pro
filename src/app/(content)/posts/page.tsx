"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Send, Clock, CheckCircle, XCircle, Plus, Eye, Heart, MessageCircle, X, Trash2 } from "lucide-react";

interface Post {
  id: string;
  content: string;
  platforms: string[];
  status: "draft" | "scheduled" | "published" | "failed";
  brand: string;
  scheduledAt?: string;
  engagement?: { likes: number; comments: number; reach: number };
}

const initialPosts: Post[] = [
  { id: "1", content: "Ny luksus villa i Altea med fantastisk havutsikt! 3 sov, pool, moderne design. #eiendom #spania", platforms: ["instagram", "facebook"], status: "published", brand: "Soleada.no", engagement: { likes: 42, comments: 8, reach: 1200 } },
  { id: "2", content: "ChatGenius lanserer ny AI-drevet kundeservice-modul. Automatiser 80% av henvendelsene.", platforms: ["linkedin"], status: "scheduled", brand: "ChatGenius.pro", scheduledAt: "2026-03-22 10:00" },
  { id: "3", content: "Fersk olivenolje fra vår gård i Andalusia. Bestill nå for vårsesongen!", platforms: ["instagram", "facebook"], status: "draft", brand: "Dona Anna" },
  { id: "4", content: "5 tips for å kjøpe bolig i Spania som nordmann. Les vår nye guide! Link i bio.", platforms: ["instagram"], status: "draft", brand: "Freddy Bremseth" },
  { id: "5", content: "Ny musikkvideo ute nå! 'Midnight Pulse' - en AI-generert EDM-reise. Lytt på YouTube!", platforms: ["instagram", "twitter", "facebook"], status: "published", brand: "Neural Beat", engagement: { likes: 156, comments: 23, reach: 4500 } },
];

const statusConfig = {
  draft: { label: "Kladd", icon: FileText, variant: "secondary" as const },
  scheduled: { label: "Planlagt", icon: Clock, variant: "warning" as const },
  published: { label: "Publisert", icon: CheckCircle, variant: "success" as const },
  failed: { label: "Feilet", icon: XCircle, variant: "destructive" as const },
};

const allPlatforms = ["instagram", "facebook", "linkedin", "twitter", "youtube", "tiktok"];

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [showNew, setShowNew] = useState(false);
  const [newPost, setNewPost] = useState({ content: "", platforms: ["instagram"] as string[], brand: "Soleada.no" });
  const [activeTab, setActiveTab] = useState("all");

  const filteredPosts = activeTab === "all" ? posts : posts.filter((p) => p.status === activeTab);

  const togglePlatform = (p: string) => {
    setNewPost((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(p) ? prev.platforms.filter((x) => x !== p) : [...prev.platforms, p],
    }));
  };

  const addPost = () => {
    if (!newPost.content) return;
    setPosts((prev) => [
      { id: `p${Date.now()}`, content: newPost.content, platforms: newPost.platforms, status: "draft", brand: newPost.brand },
      ...prev,
    ]);
    setNewPost({ content: "", platforms: ["instagram"], brand: "Soleada.no" });
    setShowNew(false);
  };

  const publishPost = (id: string) => {
    setPosts((prev) => prev.map((p) =>
      p.id === id ? { ...p, status: "published" as const, engagement: { likes: 0, comments: 0, reach: 0 } } : p
    ));
  };

  const deletePost = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="text-primary-400" size={28} />
            Innlegg
          </h1>
          <p className="text-sm text-slate-400 mt-1">Administrer og publiser innhold på tvers av plattformer</p>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-2" />Nytt innlegg</Button>
      </div>

      {/* New Post Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNew(false)}>
          <Card className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Nytt innlegg</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowNew(false)}><X size={18} /></Button>
              </div>
              <div className="space-y-3">
                <textarea value={newPost.content} onChange={(e) => setNewPost((p) => ({ ...p, content: e.target.value }))} placeholder="Skriv innholdet ditt her..." className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 h-32 resize-none" />
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Plattformer</label>
                  <div className="flex flex-wrap gap-2">
                    {allPlatforms.map((p) => (
                      <button key={p} onClick={() => togglePlatform(p)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${newPost.platforms.includes(p) ? "bg-primary-500/20 text-primary-300 border border-primary-500/30" : "bg-slate-700/50 text-slate-400 border border-slate-600"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Brand</label>
                  <select value={newPost.brand} onChange={(e) => setNewPost((p) => ({ ...p, brand: e.target.value }))} className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100">
                    <option>Soleada.no</option><option>Zen Eco Homes</option><option>ChatGenius.pro</option><option>Dona Anna</option><option>Freddy Bremseth</option><option>Pinoso Ecolife</option><option>Neural Beat</option>
                  </select>
                </div>
                <Button onClick={addPost} className="w-full" disabled={!newPost.content}><Plus size={16} className="mr-1" />Opprett som kladd</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Alle ({posts.length})</TabsTrigger>
          <TabsTrigger value="draft">Kladder ({posts.filter((p) => p.status === "draft").length})</TabsTrigger>
          <TabsTrigger value="scheduled">Planlagte ({posts.filter((p) => p.status === "scheduled").length})</TabsTrigger>
          <TabsTrigger value="published">Publiserte ({posts.filter((p) => p.status === "published").length})</TabsTrigger>
        </TabsList>

        {["all", "draft", "scheduled", "published"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <div className="space-y-4">
              {filteredPosts.length === 0 ? (
                <p className="text-slate-500 text-sm py-8 text-center">Ingen innlegg i denne kategorien</p>
              ) : (
                filteredPosts.map((post) => {
                  const config = statusConfig[post.status];
                  return (
                    <Card key={post.id}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="outline">{post.brand}</Badge>
                              <Badge variant={config.variant}><config.icon size={12} className="mr-1" />{config.label}</Badge>
                              {post.platforms.map((p) => (<Badge key={p} variant="secondary" className="text-[10px] capitalize">{p}</Badge>))}
                            </div>
                            <p className="text-sm text-slate-200">{post.content}</p>
                            {post.scheduledAt && <p className="text-xs text-slate-500 mt-2">Planlagt: {post.scheduledAt}</p>}
                            {post.engagement && (
                              <div className="flex gap-4 mt-3 text-xs text-slate-400">
                                <span className="flex items-center gap-1"><Heart size={12} /> {post.engagement.likes}</span>
                                <span className="flex items-center gap-1"><MessageCircle size={12} /> {post.engagement.comments}</span>
                                <span className="flex items-center gap-1"><Eye size={12} /> {post.engagement.reach}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4">
                            {post.status === "draft" && (
                              <Button size="sm" onClick={() => publishPost(post.id)}><Send size={14} className="mr-1" />Publiser</Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => deletePost(post.id)}><Trash2 size={14} /></Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
