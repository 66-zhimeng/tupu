"""人员管理服务层"""
from __future__ import annotations

import uuid
from typing import List, Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.schemas.member import MemberCreate, MemberUpdate


async def list_members(db: AsyncSession) -> List[Member]:
    """获取所有成员"""
    result = await db.execute(select(Member).order_by(Member.name))
    return list(result.scalars().all())


async def get_member(db: AsyncSession, member_id: uuid.UUID) -> Optional[Member]:
    """按 ID 获取"""
    result = await db.execute(select(Member).where(Member.id == member_id))
    return result.scalar_one_or_none()


async def get_member_by_name(db: AsyncSession, name: str) -> Optional[Member]:
    """按名称获取"""
    result = await db.execute(select(Member).where(Member.name == name))
    return result.scalar_one_or_none()


async def create_member(db: AsyncSession, data: MemberCreate) -> Member:
    """创建成员"""
    member = Member(name=data.name.strip(), color=data.color)
    db.add(member)
    await db.flush()
    await db.refresh(member)
    return member


async def update_member(
    db: AsyncSession, member_id: uuid.UUID, data: MemberUpdate
) -> Optional[Member]:
    """更新成员"""
    member = await get_member(db, member_id)
    if not member:
        return None
    if data.name is not None:
        member.name = data.name.strip()
    if data.color is not None:
        member.color = data.color
    await db.flush()
    await db.refresh(member)
    return member


async def delete_member(db: AsyncSession, member_id: uuid.UUID) -> bool:
    """删除成员"""
    result = await db.execute(delete(Member).where(Member.id == member_id))
    return result.rowcount > 0
