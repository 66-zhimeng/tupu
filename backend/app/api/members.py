"""人员管理 API"""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.member import MemberCreate, MemberUpdate, MemberResponse
from app.services import member_service

router = APIRouter(prefix="/api/members", tags=["members"])


@router.get("", response_model=List[MemberResponse])
async def get_members(db: AsyncSession = Depends(get_db)):
    """获取所有成员"""
    return await member_service.list_members(db)


@router.post("", response_model=MemberResponse, status_code=201)
async def create_member(data: MemberCreate, db: AsyncSession = Depends(get_db)):
    """创建成员"""
    existing = await member_service.get_member_by_name(db, data.name.strip())
    if existing:
        raise HTTPException(status_code=400, detail=f"成员 '{data.name}' 已存在")
    return await member_service.create_member(db, data)


@router.put("/{member_id}", response_model=MemberResponse)
async def update_member(
    member_id: uuid.UUID,
    data: MemberUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新成员"""
    member = await member_service.update_member(db, member_id, data)
    if not member:
        raise HTTPException(status_code=404, detail="成员不存在")
    return member


@router.delete("/{member_id}")
async def delete_member(member_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """删除成员"""
    ok = await member_service.delete_member(db, member_id)
    if not ok:
        raise HTTPException(status_code=404, detail="成员不存在")
    return {"ok": True}
