import { useMutation } from "@tanstack/react-query";
import { Camera, Save, UserCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button, Card, Input, PageHeader } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { api } from "../lib/api";
import type { User } from "../types/api";

type ProfileResponse = {
  token: string;
  user: User;
};

export function ProfilePage() {
  const { tr } = useI18n();
  const { user, updateSession } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setProfileImageUrl(user.profile_image_url ?? "");
  }, [user]);

  const isDirty = useMemo(
    () => {
      if (!user) return false;
      return (
        name.trim() !== user.name ||
        email.trim().toLowerCase() !== user.email ||
        (profileImageUrl.trim() || "") !== (user.profile_image_url ?? "")
      );
    },
    [email, name, profileImageUrl, user]
  );

  const saveProfile = useMutation({
    mutationFn: () =>
      api<ProfileResponse>("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          profileImageUrl: profileImageUrl.trim() || null
        })
      }),
    onSuccess: (response) => {
      updateSession(response.user, response.token);
      toast.success(tr("Profil yangilandi", "Профиль обновлен"));
    },
    onError: (error) => toast.error(error.message)
  });

  return (
    <>
      <PageHeader
        title={tr("Mening profilim", "Мой профиль")}
        description={tr(
          "Shaxsiy ma'lumotlaringiz va tizimga kirish emailingizni boshqaring.",
          "Управляйте личными данными и email для входа в систему."
        )}
      />

      <Card title={tr("Profil ma'lumotlari", "Данные профиля")} className="profile-settings-card">
        <div className="profile-settings">
          <div className="profile-preview">
            <span className="profile-preview-avatar">
              {profileImageUrl.trim() ? (
                <img src={profileImageUrl.trim()} alt={name || user?.name || "Profile"} />
              ) : (
                <UserCircle2 size={42} />
              )}
            </span>
            <div>
              <strong>{name || user?.name}</strong>
              <small>{email || user?.email}</small>
            </div>
          </div>

          <div className="form-grid">
            <Input
              label={tr("To'liq ism", "Полное имя")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              label={tr("Login email", "Email для входа")}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              label={tr("Profil rasmi URL", "URL фото профиля")}
              value={profileImageUrl}
              onChange={(event) => setProfileImageUrl(event.target.value)}
              placeholder="https://..."
              className="full"
            />
          </div>

          <div className="inline-note">
            <Camera size={16} />
            {tr(
              "Profil rasmi ixtiyoriy. Ochiq rasm havolasi bersangiz avatar va user menyuda ko'rinadi.",
              "Фото профиля необязательно. Если указать открытую ссылку, аватар будет виден в меню."
            )}
          </div>

          <Button
            loading={saveProfile.isPending}
            disabled={!isDirty || name.trim().length < 2 || !email.trim()}
            onClick={() => saveProfile.mutate()}
          >
            <Save size={16} /> {tr("Profilni saqlash", "Сохранить профиль")}
          </Button>
        </div>
      </Card>
    </>
  );
}
