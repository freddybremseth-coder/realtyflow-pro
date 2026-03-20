"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Send, Clock, CheckCircle, XCircle, Plus, Eye, Heart, MessageCircle } from "lucide-react";

interface Post {
  id: string;
  content: string;
  platforms: string[];
  status: "draft" | "scheduled" | "published" | "failed";
  brand: string;
  scheduledAt?: string;
  engagement?: { likes: number; comments: number; reach: number };
}

const mockPosts: Post[] = [
  { id: "1", content: "Ny luksus villa i Altea med fantastisk havutsikt! 3 sov, pool, moderne design. #eiendom #spania", platforms: ["instagram", "facebook"], status: "published", brand: "Soleada.no", engagement: { likes: 42, comments: 8, reach: 1200 } },
  { id: "2", content: "ChatGenius lanserer ny AI-drevet kundeservice-modul. Automatiser 80% av henvendelsene.", platforms: ["linkedin"], status: "scheduled", brand: "ChatGenius.pro", scheduledAt: "2026-03-22 10:00" },
  { id: "3", content: "Fersk olivenolje fra vår gård i Andalusia. Bestill nå for vårsesongen!", platforms: ["instagram", "facebook"], status: "draft", brand: "Dona Anna" },
];

const statusConfig = {
  draft: { label: "Kladd", icon: FileText, variant: "secondary" as const },
  scheduled: { label: "Planlagt", icon: Clock, variant: "warning" as const },
  published: { label: "Publisert", icon: CheckCircle, variant: "success" as const },
  failed: { label: "Feilet", icon: XCircle, variant: "destructive" as const },
};

export default function PostsPage() {
  const [posts] = useState<Post[]>(mockPosts);

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
        <Button>
          <Plus size={16} className="mr-2" />
          Nytt innlegg
        </Button>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Alle ({posts.length})</TabsTrigger>
          <TabsTrigger value="draft">Kladder</TabsTrigger>
          <TabsTrigger value="scheduled">Planlagte</TabsTrigger>
          <TabsTrigger value="published">Publiserte</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <div className="space-y-4">
            {posts.map((post) => {
              const config = statusConfig[post.status];
              return (
                <Card key={post.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">{post.brand}</Badge>
                          <Badge variant={config.variant}>
                            <config.icon size={12} className="mr-1" />
                            {config.label}
                          </Badge>
                          {post.platforms.map((p) => (
                            <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                          ))}
                        </div>
                        <p className="text-sm text-slate-200">{post.content}</p>
                        {post.scheduledAt && (
                          <p className="text-xs text-slate-500 mt-2">Planlagt: {post.scheduledAt}</p>
                        )}
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
                          <Button size="sm">
                            <Send size={14} className="mr-1" />
                            Publiser
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="draft">
          <p className="text-slate-400 text-sm">Kladder vises her.</p>
        </TabsContent>
        <TabsContent value="scheduled">
          <p className="text-slate-400 text-sm">Planlagte innlegg vises her.</p>
        </TabsContent>
        <TabsContent value="published">
          <p className="text-slate-400 text-sm">Publiserte innlegg vises her.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
