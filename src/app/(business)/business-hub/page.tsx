"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BRANDS } from "@/lib/constants";
import { Briefcase, Users, Mail, TrendingUp } from "lucide-react";

const brandStats = [
  { brand: "Soleada.no", leads: 18, revenue: "€245K", conversion: "23%" },
  { brand: "Zen Eco Homes", leads: 12, revenue: "€180K", conversion: "19%" },
  { brand: "ChatGenius.pro", leads: 34, revenue: "$12K MRR", conversion: "8%" },
  { brand: "Dona Anna", leads: 8, revenue: "€4.2K", conversion: "31%" },
  { brand: "Freddy Bremseth", leads: 5, revenue: "-", conversion: "-" },
  { brand: "Neural Beat", leads: 2, revenue: "€120", conversion: "-" },
];

export default function BusinessHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Briefcase className="text-primary-400" size={28} />
          Business Hub
        </h1>
        <p className="text-sm text-slate-400 mt-1">Samlet oversikt over alle brands og leads</p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="inbox">Unified Inbox</TabsTrigger>
          <TabsTrigger value="crm">CRM Kanban</TabsTrigger>
          <TabsTrigger value="marketing">AI Marketing</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brandStats.map((stat) => {
              const brand = BRANDS.find((b) => b.name === stat.brand);
              return (
                <Card key={stat.brand}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                        style={{
                          backgroundColor: (brand?.color || "#06b6d4") + "33",
                          color: brand?.color || "#06b6d4",
                        }}
                      >
                        {stat.brand.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-sm">{stat.brand}</h3>
                        <Badge variant="secondary" className="text-[10px]">{brand?.type}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-white">{stat.leads}</p>
                        <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
                          <Users size={10} /> Leads
                        </p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">{stat.revenue}</p>
                        <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
                          <TrendingUp size={10} /> Omsetning
                        </p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">{stat.conversion}</p>
                        <p className="text-[10px] text-slate-500">Konv.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="inbox">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail size={18} /> Unified Inbox
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 text-sm">Alle henvendelser fra alle brands samlet her. Kobles til Supabase.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crm">
          <p className="text-slate-400 text-sm">CRM Kanban-visning kommer her.</p>
        </TabsContent>

        <TabsContent value="marketing">
          <p className="text-slate-400 text-sm">AI Marketing Generator-visning kommer her.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
