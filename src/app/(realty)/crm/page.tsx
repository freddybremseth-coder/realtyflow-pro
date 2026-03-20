"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Mail, Phone, User, Building2,
  MoreHorizontal, MessageSquare, Calendar, Eye,
  Users, Filter, ArrowUpDown,
} from "lucide-react";

type CustomerStatus = "ACTIVE" | "VIP" | "INACTIVE";
type CustomerType = "BUYER" | "SELLER" | "INVESTOR";

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: CustomerStatus;
  type: CustomerType;
  preferredLocation: string;
  budget?: string;
  lastContact: string;
  notes: string;
  interactions: number;
  avatar: string;
}

const customers: Customer[] = [
  {
    id: "C001",
    name: "Erik Hansen",
    email: "erik.hansen@gmail.com",
    phone: "+47 912 34 567",
    status: "VIP",
    type: "BUYER",
    preferredLocation: "Altea, Costa Blanca",
    budget: "€300K - €500K",
    lastContact: "2024-03-14",
    notes: "Soker villa med havutsikt. Planlegger besok i april.",
    interactions: 24,
    avatar: "EH",
  },
  {
    id: "C002",
    name: "Ingrid Pedersen",
    email: "ingrid.p@outlook.no",
    phone: "+47 978 90 123",
    status: "ACTIVE",
    type: "INVESTOR",
    preferredLocation: "Torrevieja, Alicante",
    budget: "€150K - €250K",
    lastContact: "2024-03-10",
    notes: "Interessert i utleieeiendommer. Onsker 2-3 leiligheter.",
    interactions: 18,
    avatar: "IP",
  },
  {
    id: "C003",
    name: "Knut Eriksen",
    email: "knut.e@yahoo.no",
    phone: "+47 956 78 901",
    status: "ACTIVE",
    type: "BUYER",
    preferredLocation: "Benidorm, Costa Blanca",
    budget: "€200K - €350K",
    lastContact: "2024-03-08",
    notes: "Pensjonist. Soker leilighet nær strand for overvintring.",
    interactions: 12,
    avatar: "KE",
  },
  {
    id: "C004",
    name: "Maria Solberg",
    email: "maria.s@hotmail.com",
    phone: "+47 934 56 789",
    status: "VIP",
    type: "SELLER",
    preferredLocation: "Javea, Costa Blanca",
    lastContact: "2024-03-12",
    notes: "Selger villa i Javea. Estimert verdi €620K.",
    interactions: 31,
    avatar: "MS",
  },
  {
    id: "C005",
    name: "Per Olsen",
    email: "per.o@telia.no",
    phone: "+47 478 90 123",
    status: "INACTIVE",
    type: "BUYER",
    preferredLocation: "Calpe, Costa Blanca",
    budget: "€180K - €280K",
    lastContact: "2024-01-20",
    notes: "Har ikke svart pa henvendelser siden januar.",
    interactions: 5,
    avatar: "PO",
  },
];

function statusVariant(status: CustomerStatus) {
  switch (status) {
    case "VIP":
      return "warning" as const;
    case "ACTIVE":
      return "success" as const;
    case "INACTIVE":
      return "secondary" as const;
  }
}

function typeLabel(type: CustomerType) {
  switch (type) {
    case "BUYER":
      return "Kjoper";
    case "SELLER":
      return "Selger";
    case "INVESTOR":
      return "Investor";
  }
}

function typeVariant(type: CustomerType) {
  switch (type) {
    case "BUYER":
      return "default" as const;
    case "SELLER":
      return "success" as const;
    case "INVESTOR":
      return "warning" as const;
  }
}

export default function CRMPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("Alle");
  const [typeFilter, setTypeFilter] = useState<string>("Alle");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const filtered = customers.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "Alle" && c.status !== statusFilter) return false;
    if (typeFilter !== "Alle" && c.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Kundebehandling (CRM)</h1>
          <p className="text-sm text-slate-400 mt-1">
            Administrer kunder, kjopere, selgere og investorer
          </p>
        </div>
        <Button size="sm">
          <Plus size={16} className="mr-1" />
          Ny Kunde
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Totalt kunder", value: customers.length, icon: Users, color: "text-primary-400" },
          { label: "VIP kunder", value: customers.filter((c) => c.status === "VIP").length, icon: User, color: "text-amber-400" },
          { label: "Aktive", value: customers.filter((c) => c.status === "ACTIVE").length, icon: Building2, color: "text-emerald-400" },
          { label: "Investorer", value: customers.filter((c) => c.type === "INVESTOR").length, icon: Building2, color: "text-purple-400" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-xl font-bold text-white mt-0.5">{stat.value}</p>
                </div>
                <stat.icon size={20} className={`${stat.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Sok etter kunde..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none"
              >
                <option value="Alle">Alle statuser</option>
                <option value="VIP">VIP</option>
                <option value="ACTIVE">Aktiv</option>
                <option value="INACTIVE">Inaktiv</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100 focus:border-primary-500 focus:outline-none"
              >
                <option value="Alle">Alle typer</option>
                <option value="BUYER">Kjoper</option>
                <option value="SELLER">Selger</option>
                <option value="INVESTOR">Investor</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer Table */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                        <button className="flex items-center gap-1 hover:text-slate-200">
                          Kunde <ArrowUpDown size={12} />
                        </button>
                      </th>
                      <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Kontakt</th>
                      <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                      <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Sist kontakt</th>
                      <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((customer) => (
                      <tr
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className={`border-b border-slate-700/30 hover:bg-slate-800/50 cursor-pointer transition-colors ${
                          selectedCustomer?.id === customer.id ? "bg-slate-800/70" : ""
                        }`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500/30 to-purple-500/30 flex items-center justify-center text-xs font-semibold text-slate-200">
                              {customer.avatar}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-100">{customer.name}</p>
                              <p className="text-xs text-slate-500">{customer.preferredLocation}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                              <Mail size={10} />
                              <span>{customer.email}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                              <Phone size={10} />
                              <span>{customer.phone}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant={statusVariant(customer.status)}>{customer.status}</Badge>
                        </td>
                        <td className="p-4">
                          <Badge variant={typeVariant(customer.type)}>{typeLabel(customer.type)}</Badge>
                        </td>
                        <td className="p-4 text-xs text-slate-400">{customer.lastContact}</td>
                        <td className="p-4">
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal size={16} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel */}
        <div>
          {selectedCustomer ? (
            <Card className="sticky top-6">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500/30 to-purple-500/30 flex items-center justify-center text-base font-semibold text-slate-200">
                    {selectedCustomer.avatar}
                  </div>
                  <div>
                    <CardTitle>{selectedCustomer.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={statusVariant(selectedCustomer.status)} className="text-[10px]">
                        {selectedCustomer.status}
                      </Badge>
                      <Badge variant={typeVariant(selectedCustomer.type)} className="text-[10px]">
                        {typeLabel(selectedCustomer.type)}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Mail size={14} className="text-slate-500" />
                    {selectedCustomer.email}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Phone size={14} className="text-slate-500" />
                    {selectedCustomer.phone}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Building2 size={14} className="text-slate-500" />
                    {selectedCustomer.preferredLocation}
                  </div>
                  {selectedCustomer.budget && (
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                      <span className="text-slate-500 text-xs">Budsjett:</span>
                      {selectedCustomer.budget}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
                  <p className="text-xs text-slate-500 mb-1">Notater</p>
                  <p className="text-sm text-slate-300">{selectedCustomer.notes}</p>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Interaksjoner</span>
                  <span className="text-white font-medium">{selectedCustomer.interactions}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" className="text-xs">
                    <Mail size={12} className="mr-1" />
                    E-post
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    <Phone size={12} className="mr-1" />
                    Ring
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    <Calendar size={12} className="mr-1" />
                    Mote
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="flex items-center justify-center min-h-[300px]">
              <div className="text-center p-6">
                <Eye size={32} className="mx-auto text-slate-600 mb-2" />
                <p className="text-sm text-slate-500">
                  Velg en kunde for a se detaljer
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
