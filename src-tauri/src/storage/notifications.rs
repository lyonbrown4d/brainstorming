use super::MetadataStore;
use crate::document::Result;

impl MetadataStore {
    pub async fn notifications_enabled(&self) -> Result<bool> {
        Ok(
            sqlx::query_scalar::<_, i64>("SELECT enabled FROM notification_preferences WHERE id=1")
                .fetch_one(&self.pool)
                .await?
                == 1,
        )
    }
    pub async fn set_notifications_enabled(&self, enabled: bool) -> Result<()> {
        sqlx::query("UPDATE notification_preferences SET enabled=?1 WHERE id=1")
            .bind(i64::from(enabled))
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
